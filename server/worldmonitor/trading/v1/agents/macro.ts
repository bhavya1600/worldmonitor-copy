/**
 * Macro-Economic specialist agent.
 * Analyzes FRED data, yield curves, BIS rates, economic stress, and trade flows.
 */

import { MacroReportSchema, type MacroReport } from '../schemas/index';
import { MACRO_AGENT_PROMPT } from '../prompts/macro';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];

  sections.push(`User query: ${ctx.query}`);

  const macro = ctx.domainData.macroSignals;
  if (macro && typeof macro === 'object') {
    sections.push('--- MACRO SIGNALS ---');
    sections.push(formatMacroSignals(macro as Record<string, unknown>));
  }

  const fredData = ctx.domainData.fredBatch;
  if (fredData && typeof fredData === 'object') {
    sections.push('--- FRED ECONOMIC DATA ---');
    sections.push(formatFredData(fredData));
  }

  const yieldCurve = ctx.domainData.yieldCurve;
  if (yieldCurve) {
    sections.push('--- YIELD CURVE ---');
    sections.push(JSON.stringify(yieldCurve).slice(0, 1000));
  }

  const bisData = ctx.domainData.bisData;
  if (bisData) {
    sections.push('--- BIS POLICY RATES ---');
    sections.push(JSON.stringify(bisData).slice(0, 1000));
  }

  const economicStress = ctx.domainData.economicStress;
  if (economicStress) {
    sections.push('--- ECONOMIC STRESS INDEX ---');
    sections.push(JSON.stringify(economicStress).slice(0, 800));
  }

  const tradeData = ctx.domainData.tradePolicy;
  if (tradeData) {
    sections.push('--- TRADE POLICY / CUSTOMS ---');
    sections.push(JSON.stringify(tradeData).slice(0, 800));
  }

  const energyStorage = ctx.domainData.energyStorage;
  if (energyStorage) {
    sections.push('--- ENERGY STORAGE ---');
    sections.push(JSON.stringify(energyStorage).slice(0, 600));
  }

  sections.push('--- PORTFOLIO CONTEXT ---');
  const totalValue = ctx.portfolio.performance.totalValue;
  const assetTypes = new Map<string, number>();
  for (const h of ctx.portfolio.holdings) {
    assetTypes.set(h.assetType, (assetTypes.get(h.assetType) || 0) + h.weight);
  }
  sections.push(`Total Value: $${totalValue.toFixed(0)} | Cash: ${ctx.portfolio.riskMetrics.cashPct.toFixed(1)}%`);
  for (const [type, weight] of assetTypes) {
    sections.push(`${type}: ${weight.toFixed(1)}%`);
  }

  return sections.join('\n');
}

function formatMacroSignals(data: Record<string, unknown>): string {
  const lines: string[] = [];
  const signals = Array.isArray(data.signals) ? data.signals : [];
  for (const sig of signals.slice(0, 20) as Record<string, unknown>[]) {
    const s = (v: unknown) => typeof v === 'string' ? v : '';
    const n = (v: unknown) => typeof v === 'number' ? v.toFixed(2) : '?';
    lines.push(`${s(sig.name)}: ${n(sig.value)} (${s(sig.signal || sig.status)}) — ${s(sig.description || '')}`);
  }
  if (lines.length === 0) lines.push(JSON.stringify(data).slice(0, 1500));
  return lines.join('\n');
}

function formatFredData(data: unknown): string {
  if (Array.isArray(data)) {
    return data.slice(0, 15).map((d: Record<string, unknown>) => {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      const n = (v: unknown) => typeof v === 'number' ? v.toFixed(2) : '?';
      return `${s(d.seriesId || d.id)}: ${n(d.value)} (${s(d.date || d.period)})`;
    }).join('\n');
  }
  return JSON.stringify(data).slice(0, 1500);
}

export async function runMacroAgent(ctx: AgentContext): Promise<AgentResult<MacroReport>> {
  return runAgent({
    agentType: 'macro',
    schema: MacroReportSchema,
    systemPrompt: MACRO_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
