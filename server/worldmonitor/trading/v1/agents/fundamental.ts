/**
 * Fundamental Analysis specialist agent.
 * Analyzes earnings, sector rotation, ETF flows, and COT data.
 */

import { FundamentalReportSchema, type FundamentalReport } from '../schemas/index';
import { FUNDAMENTAL_AGENT_PROMPT } from '../prompts/fundamental';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];

  sections.push(`User query: ${ctx.query}`);
  sections.push(`Focus symbols: ${ctx.symbols.join(', ') || 'portfolio holdings'}`);

  const earnings = ctx.domainData.earningsCalendar;
  if (earnings && Array.isArray(earnings)) {
    sections.push('--- EARNINGS CALENDAR ---');
    for (const e of earnings.slice(0, 15) as Record<string, unknown>[]) {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      sections.push(`${s(e.symbol)} (${s(e.name)}): ${s(e.date)} — Est: ${s(e.estimate)}, Prior: ${s(e.prior)}`);
    }
  }

  const etfFlows = ctx.domainData.etfFlows;
  if (etfFlows && Array.isArray(etfFlows)) {
    sections.push('--- ETF FLOWS ---');
    for (const f of etfFlows.slice(0, 10) as Record<string, unknown>[]) {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      const n = (v: unknown) => typeof v === 'number' ? v.toFixed(2) : '?';
      sections.push(`${s(f.symbol)} (${s(f.name)}): Flow ${n(f.flow)}M | AUM ${n(f.aum)}B | Change ${n(f.changePercent)}%`);
    }
  }

  const sectors = ctx.domainData.sectorSummary;
  if (sectors && typeof sectors === 'object') {
    sections.push('--- SECTOR PERFORMANCE ---');
    const sectorData = Array.isArray(sectors) ? sectors : (sectors as Record<string, unknown>).sectors;
    if (Array.isArray(sectorData)) {
      for (const s of sectorData.slice(0, 15) as Record<string, unknown>[]) {
        const str = (v: unknown) => typeof v === 'string' ? v : '';
        const n = (v: unknown) => typeof v === 'number' ? v.toFixed(2) : '?';
        sections.push(`${str(s.name || s.sector)}: ${n(s.changePercent)}% | Volume: ${str(s.volume ?? '')}`);
      }
    }
  }

  const cot = ctx.domainData.cotPositioning;
  if (cot && typeof cot === 'object') {
    sections.push('--- COT POSITIONING ---');
    sections.push(JSON.stringify(cot).slice(0, 1500));
  }

  sections.push('--- PORTFOLIO ---');
  sections.push(`Cash: $${ctx.portfolio.cash.toFixed(0)} | Holdings: ${ctx.portfolio.holdings.length}`);
  for (const h of ctx.portfolio.holdings.slice(0, 15)) {
    sections.push(`${h.symbol} (${h.sector}): ${h.weight.toFixed(1)}% of portfolio, P&L ${h.unrealizedPnlPct.toFixed(1)}%`);
  }

  return sections.join('\n');
}

export async function runFundamentalAgent(ctx: AgentContext): Promise<AgentResult<FundamentalReport>> {
  return runAgent({
    agentType: 'fundamental',
    schema: FundamentalReportSchema,
    systemPrompt: FUNDAMENTAL_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
