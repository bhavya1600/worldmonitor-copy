/**
 * Master Orchestrator for the AI trading agent system.
 *
 * 1. Classifies user intent and selects specialist agents
 * 2. Assembles domain data from WorldMonitor
 * 3. Runs selected agents in parallel
 * 4. Synthesizes reports via reasoning model into a streamed response
 */

import { generateObject, streamText } from 'ai';
import { getAvailableModel } from '../../../_shared/ai-providers';
import { IntentClassificationSchema, type IntentClassification } from './schemas/index';
import {
  ORCHESTRATOR_CLASSIFY_PROMPT,
  ORCHESTRATOR_SYNTHESIS_PROMPT,
} from './prompts/orchestrator';
import { assembleTradingContext } from './context-assembler';
import {
  getPortfolio,
  saveAgentStates,
  type TradingPortfolio,
  type AgentState,
} from './portfolio-store';

import { runTechnicalAgent } from './agents/technical';
import { runFundamentalAgent } from './agents/fundamental';
import { runMacroAgent } from './agents/macro';
import { runGeopoliticalAgent } from './agents/geopolitical';
import { runSentimentAgent } from './agents/sentiment';
import { runRiskQuantAgent } from './agents/risk-quant';
import type { AgentContext, AgentResult } from './agents/_base';

type AgentName = 'technical' | 'fundamental' | 'macro' | 'geopolitical' | 'sentiment' | 'risk_quant';

const AGENT_RUNNERS: Record<AgentName, (ctx: AgentContext) => Promise<AgentResult<unknown>>> = {
  technical: runTechnicalAgent,
  fundamental: runFundamentalAgent,
  macro: runMacroAgent,
  geopolitical: runGeopoliticalAgent,
  sentiment: runSentimentAgent,
  risk_quant: runRiskQuantAgent,
};

export interface OrchestratorInput {
  userId: string;
  portfolioId?: string;
  query: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface OrchestratorResult {
  stream: ReadableStream<Uint8Array>;
  classification: IntentClassification;
}

// ---------------------------------------------------------------------------
// Step 1: Intent classification
// ---------------------------------------------------------------------------

async function classifyIntent(
  query: string,
  portfolio: TradingPortfolio,
  history: Array<{ role: string; content: string }>,
): Promise<IntentClassification> {
  const model = getAvailableModel('fast');
  const portfolioSummary = buildPortfolioSummary(portfolio);

  try {
    const { object } = await generateObject({
      model,
      schema: IntentClassificationSchema,
      system: ORCHESTRATOR_CLASSIFY_PROMPT,
      prompt: [
        `User message: "${query}"`,
        '',
        '--- PORTFOLIO ---',
        portfolioSummary,
        '',
        '--- RECENT CONVERSATION ---',
        history.slice(-4).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n'),
      ].join('\n'),
      temperature: 0.1,
    });
    return object;
  } catch (err) {
    console.warn('[orchestrator] Classification failed, using defaults:', (err as Error).message);
    return {
      intent: 'general_question',
      agents: ['technical', 'sentiment'],
      symbols: [],
      reasoning: 'Classification failed; using default agent selection.',
    };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Run selected agents in parallel
// ---------------------------------------------------------------------------

async function runAgents(
  agents: AgentName[],
  ctx: AgentContext,
): Promise<Array<AgentResult<unknown>>> {
  const runners = agents
    .filter((name) => AGENT_RUNNERS[name])
    .map((name) => AGENT_RUNNERS[name]!(ctx));

  const settled = await Promise.allSettled(runners);

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      agentType: agents[i]! as AgentResult<unknown>['agentType'],
      report: null,
      durationMs: 0,
      model: 'error',
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    } as AgentResult<unknown>;
  });
}

// ---------------------------------------------------------------------------
// Step 3: Synthesize and stream
// ---------------------------------------------------------------------------

function buildSynthesisContext(
  query: string,
  classification: IntentClassification,
  agentResults: AgentResult<unknown>[],
  portfolio: TradingPortfolio,
): string {
  const sections: string[] = [];

  sections.push(`User query: "${query}"`);
  sections.push(`Intent: ${classification.intent}`);
  sections.push(`Symbols of interest: ${classification.symbols.join(', ') || 'none specified'}`);
  sections.push('');

  sections.push('=== PORTFOLIO STATE ===');
  sections.push(buildPortfolioSummary(portfolio));
  sections.push('');

  sections.push('=== SPECIALIST AGENT REPORTS ===');
  for (const result of agentResults) {
    sections.push(`\n--- ${result.agentType.toUpperCase()} AGENT (${result.durationMs}ms, model: ${result.model}) ---`);
    if (result.error) {
      sections.push(`ERROR: ${result.error}`);
    } else if (result.report) {
      sections.push(JSON.stringify(result.report, null, 2));
    } else {
      sections.push('(no report produced)');
    }
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Main orchestration entry point
// ---------------------------------------------------------------------------

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorResult> {
  const portfolio = await getPortfolio(input.userId, input.portfolioId);

  // Step 1: Classify intent and select agents
  const classification = await classifyIntent(
    input.query,
    portfolio,
    input.history,
  );

  const agentNames = classification.agents as AgentName[];

  // Step 2: Fetch domain data for selected agents
  const domainData = await assembleTradingContext(agentNames);

  // Step 3: Run selected agents in parallel
  const agentContext: AgentContext = {
    query: input.query,
    symbols: classification.symbols,
    portfolio,
    domainData: domainData as unknown as Record<string, unknown>,
  };

  const agentResults = await runAgents(agentNames, agentContext);

  // Save agent states for the UI status panel
  const agentStates: AgentState[] = agentResults.map((r) => ({
    agentType: r.agentType,
    status: r.error ? 'error' as const : 'done' as const,
    confidence: extractConfidence(r.report),
    signal: extractSignal(r.report),
    lastAnalysisAt: new Date().toISOString(),
    summary: extractSummary(r.report),
  }));
  await saveAgentStates(portfolio.id, agentStates).catch(() => {});

  // Step 4: Stream synthesized response
  const synthesisContext = buildSynthesisContext(
    input.query,
    classification,
    agentResults,
    portfolio,
  );

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: ORCHESTRATOR_SYNTHESIS_PROMPT },
    ...input.history.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: synthesisContext },
  ];

  const model = getAvailableModel('reasoning');

  const result = streamText({
    model,
    messages,
    temperature: 0.4,
    maxOutputTokens: 1500,
  });

  // Build SSE stream with meta events prepended
  const metaEvent = {
    meta: {
      intent: classification.intent,
      agents: classification.agents,
      symbols: classification.symbols,
      agentStates: agentStates.map((s) => ({
        agent: s.agentType,
        status: s.status,
        confidence: s.confidence,
        signal: s.signal,
      })),
    },
  };

  const enc = new TextEncoder();
  const metaPrefix = enc.encode(`data: ${JSON.stringify(metaEvent)}\n\n`);

  const textStream = result.textStream;
  let readerStarted = false;

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(metaPrefix);

      try {
        for await (const chunk of textStream) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        if (!readerStarted) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'llm_unavailable' })}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return { stream: sseStream, classification };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPortfolioSummary(p: TradingPortfolio): string {
  const lines: string[] = [];
  lines.push(`Name: ${p.name} | Cash: $${p.cash.toFixed(0)} | Total: $${p.performance.totalValue.toFixed(0)}`);
  lines.push(`All-Time Return: ${p.performance.allTimeReturn.toFixed(2)}% | Cash%: ${p.riskMetrics.cashPct.toFixed(1)}%`);

  if (p.holdings.length > 0) {
    lines.push('Holdings:');
    for (const h of p.holdings.slice(0, 20)) {
      lines.push(
        `  ${h.symbol} (${h.assetType}/${h.sector}): ` +
        `${h.quantity} × $${h.currentPrice.toFixed(2)} = $${h.marketValue.toFixed(0)} ` +
        `(${h.weight.toFixed(1)}%, P&L: ${h.unrealizedPnlPct >= 0 ? '+' : ''}${h.unrealizedPnlPct.toFixed(1)}%)`,
      );
    }
  } else {
    lines.push('Holdings: (empty — 100% cash)');
  }

  if (p.tradeHistory.length > 0) {
    lines.push(`Recent trades: ${p.tradeHistory.slice(0, 5).map(t => `${t.side} ${t.symbol}`).join(', ')}`);
  }

  return lines.join('\n');
}

function extractConfidence(report: unknown): number {
  if (!report || typeof report !== 'object') return 0;
  const r = report as Record<string, unknown>;
  if (typeof r.confidence === 'number') return r.confidence;
  return 0;
}

function extractSignal(report: unknown): string {
  if (!report || typeof report !== 'object') return '';
  const r = report as Record<string, unknown>;
  if (typeof r.signal === 'string') return r.signal;
  if (typeof r.overallSentiment === 'string') return r.overallSentiment;
  if (typeof r.riskLevel === 'string') return r.riskLevel;
  if (typeof r.regime === 'string') return r.regime;
  if (typeof r.valuationView === 'string') return r.valuationView;
  if (typeof r.overallRisk === 'string') return r.overallRisk;
  return '';
}

function extractSummary(report: unknown): string {
  if (!report || typeof report !== 'object') return '';
  const r = report as Record<string, unknown>;
  if (typeof r.reasoning === 'string') return r.reasoning.slice(0, 200);
  return '';
}
