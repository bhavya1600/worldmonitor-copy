/**
 * Risk & Quant specialist agent.
 * Analyzes portfolio risk, position sizing, correlations, and hedging needs.
 */

import { RiskReportSchema, type RiskReport } from '../schemas/index';
import { RISK_QUANT_AGENT_PROMPT } from '../prompts/risk-quant';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];
  const p = ctx.portfolio;

  sections.push(`User query: ${ctx.query}`);

  sections.push('--- PORTFOLIO STATE ---');
  sections.push(`Total Value: $${p.performance.totalValue.toFixed(2)}`);
  sections.push(`Cash: $${p.cash.toFixed(2)} (${p.riskMetrics.cashPct.toFixed(1)}%)`);
  sections.push(`All-Time Return: ${p.performance.allTimeReturn.toFixed(2)}%`);
  sections.push(`Concentration Risk (max weight): ${p.riskMetrics.concentrationRisk.toFixed(1)}%`);
  sections.push('');

  if (p.holdings.length > 0) {
    sections.push('--- HOLDINGS ---');
    sections.push('Symbol | Qty | AvgCost | Current | P&L% | Weight% | Sector | Type');
    sections.push('-------|-----|---------|---------|------|---------|--------|-----');
    for (const h of p.holdings) {
      sections.push(
        `${h.symbol} | ${h.quantity} | $${h.avgCostBasis.toFixed(2)} | $${h.currentPrice.toFixed(2)} | ` +
        `${h.unrealizedPnlPct.toFixed(1)}% | ${h.weight.toFixed(1)}% | ${h.sector} | ${h.assetType}`,
      );
    }
  } else {
    sections.push('(No holdings — 100% cash)');
  }

  if (p.tradeHistory.length > 0) {
    sections.push('\n--- RECENT TRADES ---');
    for (const t of p.tradeHistory.slice(0, 10)) {
      sections.push(`${t.timestamp.slice(0, 10)} ${t.side.toUpperCase()} ${t.quantity} ${t.symbol} @ $${t.price.toFixed(2)} (consensus: ${t.agentConsensus}%)`);
    }
  }

  const fearGreed = ctx.domainData.fearGreedIndex;
  if (fearGreed && typeof fearGreed === 'object') {
    const fg = fearGreed as Record<string, unknown>;
    sections.push(`\n--- FEAR & GREED: ${fg.value ?? '?'} (${fg.label ?? fg.classification ?? '?'}) ---`);
  }

  const correlations = ctx.domainData.correlations;
  if (correlations) {
    sections.push('\n--- CORRELATION DATA ---');
    sections.push(JSON.stringify(correlations).slice(0, 1000));
  }

  const marketQuotes = ctx.domainData.marketQuotes;
  if (marketQuotes && Array.isArray(marketQuotes)) {
    const vixLike = marketQuotes.find((q: Record<string, unknown>) =>
      typeof q.symbol === 'string' && (q.symbol.includes('VIX') || q.symbol.includes('^VIX')),
    );
    if (vixLike) {
      const q = vixLike as Record<string, unknown>;
      sections.push(`\n--- VIX: ${typeof q.price === 'number' ? q.price.toFixed(2) : '?'} ---`);
    }
  }

  return sections.join('\n');
}

export async function runRiskQuantAgent(ctx: AgentContext): Promise<AgentResult<RiskReport>> {
  return runAgent({
    agentType: 'risk_quant',
    schema: RiskReportSchema,
    systemPrompt: RISK_QUANT_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
