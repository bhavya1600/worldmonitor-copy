/**
 * Generates structured markdown reports from agent analysis results.
 */

import type { AgentResult } from './agents/_base';
import {
  saveReport,
  type TradingPortfolio,
  type TradingReport,
  type ConsensusResult,
  type AgentState,
} from './portfolio-store';

export async function generateTradingReport(
  portfolioId: string,
  reportType: string,
  agentResults: AgentResult<unknown>[],
  portfolio: TradingPortfolio,
): Promise<TradingReport> {
  const agentStates: AgentState[] = agentResults.map((r) => ({
    agentType: r.agentType,
    status: r.error ? 'error' as const : 'done' as const,
    confidence: extractConfidence(r.report),
    signal: extractSignal(r.report),
    lastAnalysisAt: new Date().toISOString(),
    summary: extractReasoning(r.report),
  }));

  const consensus = buildConsensus(agentResults, agentStates);
  const markdown = buildReportMarkdown(reportType, agentResults, portfolio, consensus);

  const report: TradingReport = {
    id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    portfolioId,
    title: getReportTitle(reportType),
    contentMarkdown: markdown,
    consensus,
    agentStates,
    generatedAt: new Date().toISOString(),
    reportType,
  };

  await saveReport(report);
  return report;
}

function buildConsensus(
  results: AgentResult<unknown>[],
  states: AgentState[],
): ConsensusResult {
  const signals = results
    .filter((r) => r.report && !r.error)
    .map((r) => categorizeSignal(r));

  let bullish = 0;
  let bearish = 0;
  let totalWeight = 0;

  for (const s of signals) {
    totalWeight += s.confidence;
    if (s.direction === 'bullish') bullish += s.confidence;
    else if (s.direction === 'bearish') bearish += s.confidence;
  }

  const direction = bullish > bearish * 1.2
    ? 'bullish' as const
    : bearish > bullish * 1.2
      ? 'bearish' as const
      : 'neutral' as const;

  const maxConf = Math.max(bullish, bearish);
  const conviction = totalWeight > 0 ? Math.round((maxConf / totalWeight) * 10) : 0;

  const action = direction === 'bullish' && conviction >= 7
    ? 'Accumulate / Add to positions'
    : direction === 'bearish' && conviction >= 7
      ? 'Reduce exposure / Take profits'
      : direction === 'bullish'
        ? 'Hold / Selective adds'
        : direction === 'bearish'
          ? 'Hold / Hedge tail risk'
          : 'Hold / Wait for clarity';

  return {
    direction,
    conviction,
    action,
    reasoning: `${signals.length} agents reporting. Bull weight: ${bullish.toFixed(0)}, Bear weight: ${bearish.toFixed(0)}.`,
    riskWarning: buildRiskWarning(results),
    agentStates: states,
  };
}

function categorizeSignal(result: AgentResult<unknown>): { direction: string; confidence: number } {
  const report = result.report as Record<string, unknown> | null;
  if (!report) return { direction: 'neutral', confidence: 0 };

  const conf = typeof report.confidence === 'number' ? report.confidence : 50;

  const signal = typeof report.signal === 'string' ? report.signal : '';
  if (signal.includes('buy') || signal.includes('bullish')) {
    return { direction: 'bullish', confidence: conf };
  }
  if (signal.includes('sell') || signal.includes('bearish')) {
    return { direction: 'bearish', confidence: conf };
  }

  const sentiment = typeof report.overallSentiment === 'string' ? report.overallSentiment : '';
  if (sentiment.includes('bullish')) return { direction: 'bullish', confidence: conf };
  if (sentiment.includes('bearish')) return { direction: 'bearish', confidence: conf };

  const risk = typeof report.riskLevel === 'string' ? report.riskLevel : '';
  if (risk === 'critical' || risk === 'high') return { direction: 'bearish', confidence: conf };
  if (risk === 'low') return { direction: 'bullish', confidence: conf };

  const regime = typeof report.regime === 'string' ? report.regime : '';
  if (regime === 'expansion' || regime === 'goldilocks' || regime === 'reflation') {
    return { direction: 'bullish', confidence: conf };
  }
  if (regime === 'contraction' || regime === 'stagflation') {
    return { direction: 'bearish', confidence: conf };
  }

  return { direction: 'neutral', confidence: conf };
}

function buildRiskWarning(results: AgentResult<unknown>[]): string {
  const warnings: string[] = [];

  for (const r of results) {
    if (r.error) {
      warnings.push(`${r.agentType} agent failed — analysis is incomplete.`);
      continue;
    }
    const report = r.report as Record<string, unknown> | null;
    if (!report) continue;

    if (r.agentType === 'geopolitical') {
      const geo = report as { escalationProbability?: number; hotspots?: unknown[] };
      if (typeof geo.escalationProbability === 'number' && geo.escalationProbability > 60) {
        warnings.push(`Geopolitical escalation probability at ${geo.escalationProbability}%.`);
      }
    }

    if (r.agentType === 'risk_quant') {
      const risk = report as { maxDrawdownEstimate?: number; concentrationRisk?: string };
      if (typeof risk.maxDrawdownEstimate === 'number' && risk.maxDrawdownEstimate > 15) {
        warnings.push(`Max drawdown estimate: ${risk.maxDrawdownEstimate.toFixed(1)}%.`);
      }
    }
  }

  return warnings.length > 0 ? warnings.join(' ') : 'No critical risk warnings at this time.';
}

function buildReportMarkdown(
  reportType: string,
  results: AgentResult<unknown>[],
  portfolio: TradingPortfolio,
  consensus: ConsensusResult,
): string {
  const sections: string[] = [];
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  sections.push(`# ${getReportTitle(reportType)}`);
  sections.push(`*Generated: ${now} UTC*\n`);

  sections.push('## Consensus');
  sections.push(`| Metric | Value |`);
  sections.push(`|--------|-------|`);
  sections.push(`| Direction | **${consensus.direction.toUpperCase()}** |`);
  sections.push(`| Conviction | ${consensus.conviction}/10 |`);
  sections.push(`| Action | ${consensus.action} |`);
  sections.push(`| Risk Warning | ${consensus.riskWarning} |`);
  sections.push('');

  sections.push('## Portfolio Snapshot');
  sections.push(`- **Total Value**: $${portfolio.performance.totalValue.toFixed(0)}`);
  sections.push(`- **Cash**: $${portfolio.cash.toFixed(0)} (${portfolio.riskMetrics.cashPct.toFixed(1)}%)`);
  sections.push(`- **All-Time Return**: ${portfolio.performance.allTimeReturn.toFixed(2)}%`);
  sections.push(`- **Holdings**: ${portfolio.holdings.length}`);
  sections.push('');

  for (const result of results) {
    const title = agentTitle(result.agentType);
    sections.push(`## ${title}`);

    if (result.error) {
      sections.push(`*Agent error: ${result.error}*\n`);
      continue;
    }

    if (!result.report) {
      sections.push('*No report generated.*\n');
      continue;
    }

    sections.push(formatAgentReport(result.agentType, result.report));
    sections.push(`\n*Model: ${result.model} | Duration: ${result.durationMs}ms*\n`);
  }

  return sections.join('\n');
}

function formatAgentReport(_agentType: string, report: unknown): string {
  const r = report as Record<string, unknown>;
  const lines: string[] = [];

  if (typeof r.confidence === 'number') {
    lines.push(`**Confidence**: ${r.confidence}%`);
  }
  if (typeof r.signal === 'string') lines.push(`**Signal**: ${r.signal}`);
  if (typeof r.overallSentiment === 'string') lines.push(`**Sentiment**: ${r.overallSentiment}`);
  if (typeof r.riskLevel === 'string') lines.push(`**Risk Level**: ${r.riskLevel}`);
  if (typeof r.regime === 'string') lines.push(`**Regime**: ${r.regime}`);
  if (typeof r.valuationView === 'string') lines.push(`**Valuation**: ${r.valuationView}`);
  if (typeof r.overallRisk === 'string') lines.push(`**Overall Risk**: ${r.overallRisk}`);
  if (typeof r.reasoning === 'string') lines.push(`\n${r.reasoning}`);

  return lines.join('\n');
}

function agentTitle(agentType: string): string {
  const titles: Record<string, string> = {
    technical: 'Technical Analysis',
    fundamental: 'Fundamental Analysis',
    macro: 'Macro-Economic Assessment',
    geopolitical: 'Geopolitical Risk',
    sentiment: 'Sentiment & News',
    risk_quant: 'Risk & Quantitative',
  };
  return titles[agentType] ?? agentType;
}

function getReportTitle(reportType: string): string {
  const titles: Record<string, string> = {
    morning_briefing: 'Morning Market Briefing',
    portfolio_review: 'Portfolio Analysis Report',
    trade_idea: 'Trade Idea Analysis',
    risk_check: 'Risk Assessment Report',
    deep_dive: 'Deep Dive Analysis',
    general: 'Market Analysis Report',
  };
  return titles[reportType] ?? 'Trading Agent Report';
}

function extractConfidence(report: unknown): number {
  if (!report || typeof report !== 'object') return 0;
  const r = report as Record<string, unknown>;
  return typeof r.confidence === 'number' ? r.confidence : 0;
}

function extractSignal(report: unknown): string {
  if (!report || typeof report !== 'object') return '';
  const r = report as Record<string, unknown>;
  for (const key of ['signal', 'overallSentiment', 'riskLevel', 'regime', 'valuationView', 'overallRisk']) {
    if (typeof r[key] === 'string') return r[key] as string;
  }
  return '';
}

function extractReasoning(report: unknown): string {
  if (!report || typeof report !== 'object') return '';
  const r = report as Record<string, unknown>;
  return typeof r.reasoning === 'string' ? r.reasoning.slice(0, 200) : '';
}
