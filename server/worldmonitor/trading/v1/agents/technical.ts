/**
 * Technical Analysis specialist agent.
 * Fetches OHLC/indicator data from the existing AnalyzeStock infrastructure
 * and produces a structured technical report.
 */

import { TechnicalReportSchema, type TechnicalReport } from '../schemas/index';
import { TECHNICAL_AGENT_PROMPT } from '../prompts/technical';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];
  const symbols = ctx.symbols.length > 0 ? ctx.symbols : getHoldingSymbols(ctx);

  sections.push(`User query: ${ctx.query}`);
  sections.push(`Focus symbols: ${symbols.join(', ') || 'general market'}`);

  const ta = ctx.domainData.technicalAnalysis;
  if (ta && typeof ta === 'object') {
    sections.push('--- TECHNICAL DATA ---');
    sections.push(formatTechnicalData(ta as Record<string, unknown>));
  }

  const marketQuotes = ctx.domainData.marketQuotes;
  if (marketQuotes && typeof marketQuotes === 'object') {
    sections.push('--- MARKET QUOTES ---');
    sections.push(formatMarketQuotes(marketQuotes));
  }

  sections.push('--- PORTFOLIO HOLDINGS ---');
  if (ctx.portfolio.holdings.length > 0) {
    for (const h of ctx.portfolio.holdings.slice(0, 20)) {
      sections.push(`${h.symbol}: ${h.quantity} shares @ $${h.avgCostBasis.toFixed(2)} (current: $${h.currentPrice.toFixed(2)}, P&L: ${h.unrealizedPnlPct.toFixed(1)}%)`);
    }
  } else {
    sections.push('(empty portfolio — new analysis)');
  }

  return sections.join('\n');
}

function getHoldingSymbols(ctx: AgentContext): string[] {
  return ctx.portfolio.holdings.slice(0, 10).map(h => h.symbol);
}

function formatTechnicalData(ta: Record<string, unknown>): string {
  const lines: string[] = [];
  const num = (v: unknown) => typeof v === 'number' ? v : 0;
  const str = (v: unknown) => typeof v === 'string' ? v : '';

  if (Array.isArray(ta.analyses)) {
    for (const a of ta.analyses as Record<string, unknown>[]) {
      lines.push(`\n## ${str(a.symbol)} (${str(a.name)})`);
      lines.push(`Price: $${num(a.currentPrice).toFixed(2)} | Change: ${num(a.changePercent).toFixed(2)}%`);
      lines.push(`Signal: ${str(a.signal)} (score: ${num(a.signalScore).toFixed(0)})`);
      lines.push(`Trend: ${str(a.trendStatus)} | Volume: ${str(a.volumeStatus)}`);
      lines.push(`MA5: ${num(a.ma5).toFixed(2)} | MA10: ${num(a.ma10).toFixed(2)} | MA20: ${num(a.ma20).toFixed(2)} | MA60: ${num(a.ma60).toFixed(2)}`);
      lines.push(`RSI12: ${num(a.rsi12).toFixed(1)} (${str(a.rsiStatus)}) | MACD: ${str(a.macdStatus)}`);
      lines.push(`MACD DIF: ${num(a.macdDif).toFixed(4)} | DEA: ${num(a.macdDea).toFixed(4)} | Bar: ${num(a.macdBar).toFixed(4)}`);
      lines.push(`Volume Ratio 5D: ${num(a.volumeRatio5d).toFixed(2)}`);

      const support = Array.isArray(a.supportLevels) ? a.supportLevels : [];
      const resist = Array.isArray(a.resistanceLevels) ? a.resistanceLevels : [];
      if (support.length) lines.push(`Support: ${support.map((s: unknown) => `$${num(s).toFixed(2)}`).join(', ')}`);
      if (resist.length) lines.push(`Resistance: ${resist.map((r: unknown) => `$${num(r).toFixed(2)}`).join(', ')}`);

      if (a.summary) lines.push(`AI Summary: ${str(a.summary)}`);
      if (a.stopLoss) lines.push(`Stop Loss: $${num(a.stopLoss).toFixed(2)}`);
      if (a.takeProfit) lines.push(`Take Profit: $${num(a.takeProfit).toFixed(2)}`);
    }
  } else {
    lines.push(JSON.stringify(ta).slice(0, 2000));
  }

  return lines.join('\n');
}

function formatMarketQuotes(quotes: unknown): string {
  if (!Array.isArray(quotes)) return JSON.stringify(quotes).slice(0, 1500);
  return quotes.slice(0, 20).map((q: Record<string, unknown>) => {
    const s = (v: unknown) => typeof v === 'string' ? v : '';
    const n = (v: unknown) => typeof v === 'number' ? v : 0;
    return `${s(q.symbol)}: $${n(q.price).toFixed(2)} (${n(q.changePercent) >= 0 ? '+' : ''}${n(q.changePercent).toFixed(2)}%)`;
  }).join('\n');
}

export async function runTechnicalAgent(ctx: AgentContext): Promise<AgentResult<TechnicalReport>> {
  return runAgent({
    agentType: 'technical',
    schema: TechnicalReportSchema,
    systemPrompt: TECHNICAL_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
