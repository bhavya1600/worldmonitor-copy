/**
 * Sentiment & News specialist agent.
 * Analyzes news flow, prediction markets, fear/greed, and live headlines.
 */

import { SentimentReportSchema, type SentimentReport } from '../schemas/index';
import { SENTIMENT_AGENT_PROMPT } from '../prompts/sentiment';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];

  sections.push(`User query: ${ctx.query}`);

  const headlines = ctx.domainData.liveHeadlines;
  if (headlines && Array.isArray(headlines)) {
    sections.push('--- LIVE HEADLINES ---');
    for (const h of headlines.slice(0, 25) as Record<string, unknown>[]) {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      sections.push(`[${s(h.source)}] ${s(h.title || h.headline)}`);
    }
  }

  const marketBrief = ctx.domainData.dailyMarketBrief;
  if (marketBrief && typeof marketBrief === 'string') {
    sections.push('--- DAILY MARKET BRIEF ---');
    sections.push(marketBrief.slice(0, 1500));
  }

  const predictions = ctx.domainData.predictionMarkets;
  if (predictions && Array.isArray(predictions)) {
    sections.push('--- PREDICTION MARKETS ---');
    for (const p of predictions.slice(0, 15) as Record<string, unknown>[]) {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      const n = (v: unknown) => typeof v === 'number' ? v : 0;
      sections.push(`${s(p.title || p.question)}: ${(n(p.probability) * 100).toFixed(0)}% (24h: ${n(p.change24h) >= 0 ? '+' : ''}${(n(p.change24h) * 100).toFixed(1)}%)`);
    }
  }

  const fearGreed = ctx.domainData.fearGreedIndex;
  if (fearGreed && typeof fearGreed === 'object') {
    const fg = fearGreed as Record<string, unknown>;
    sections.push('--- FEAR & GREED INDEX ---');
    sections.push(`Value: ${fg.value ?? '?'} | Label: ${fg.label ?? fg.classification ?? '?'}`);
    if (fg.previousClose) sections.push(`Previous: ${fg.previousClose}`);
  }

  const marketImplications = ctx.domainData.marketImplications;
  if (marketImplications && typeof marketImplications === 'object') {
    sections.push('--- AI MARKET IMPLICATIONS ---');
    sections.push(JSON.stringify(marketImplications).slice(0, 1000));
  }

  const socialVelocity = ctx.domainData.socialVelocity;
  if (socialVelocity) {
    sections.push('--- SOCIAL VELOCITY ---');
    sections.push(JSON.stringify(socialVelocity).slice(0, 600));
  }

  sections.push('--- PORTFOLIO CONTEXT ---');
  sections.push(`Holdings: ${ctx.portfolio.holdings.map(h => h.symbol).join(', ') || 'none'}`);

  return sections.join('\n');
}

export async function runSentimentAgent(ctx: AgentContext): Promise<AgentResult<SentimentReport>> {
  return runAgent({
    agentType: 'sentiment',
    schema: SentimentReportSchema,
    systemPrompt: SENTIMENT_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
