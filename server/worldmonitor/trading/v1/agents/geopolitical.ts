/**
 * Geopolitical Risk specialist agent.
 * Analyzes conflict data, sanctions, military posture, risk scores, and intel signals.
 */

import { GeopoliticalReportSchema, type GeopoliticalReport } from '../schemas/index';
import { GEOPOLITICAL_AGENT_PROMPT } from '../prompts/geopolitical';
import { runAgent, type AgentContext, type AgentResult } from './_base';

function buildPrompt(ctx: AgentContext): string {
  const sections: string[] = [];

  sections.push(`User query: ${ctx.query}`);

  const riskScores = ctx.domainData.riskScores;
  if (riskScores && typeof riskScores === 'object') {
    sections.push('--- COUNTRY RISK SCORES ---');
    sections.push(formatRiskScores(riskScores));
  }

  const theaterPosture = ctx.domainData.theaterPosture;
  if (theaterPosture) {
    sections.push('--- THEATER POSTURE ---');
    sections.push(JSON.stringify(theaterPosture).slice(0, 1200));
  }

  const conflicts = ctx.domainData.conflicts;
  if (conflicts && Array.isArray(conflicts)) {
    sections.push('--- ACTIVE CONFLICTS ---');
    for (const c of conflicts.slice(0, 10) as Record<string, unknown>[]) {
      const s = (v: unknown) => typeof v === 'string' ? v : '';
      sections.push(`${s(c.region || c.country)}: ${s(c.type || c.eventType)} — ${s(c.description || c.notes || '')}`.slice(0, 200));
    }
  }

  const sanctions = ctx.domainData.sanctionsPressure;
  if (sanctions) {
    sections.push('--- SANCTIONS PRESSURE ---');
    sections.push(JSON.stringify(sanctions).slice(0, 1000));
  }

  const crossSourceSignals = ctx.domainData.crossSourceSignals;
  if (crossSourceSignals) {
    sections.push('--- CROSS-SOURCE INTELLIGENCE ---');
    sections.push(JSON.stringify(crossSourceSignals).slice(0, 1000));
  }

  const supplyChain = ctx.domainData.supplyChainStress;
  if (supplyChain) {
    sections.push('--- SUPPLY CHAIN STRESS ---');
    sections.push(JSON.stringify(supplyChain).slice(0, 800));
  }

  const marketImplications = ctx.domainData.marketImplications;
  if (marketImplications) {
    sections.push('--- MARKET IMPLICATIONS ---');
    sections.push(JSON.stringify(marketImplications).slice(0, 800));
  }

  sections.push('--- PORTFOLIO EXPOSURE ---');
  const sectorExposure = new Map<string, number>();
  for (const h of ctx.portfolio.holdings) {
    sectorExposure.set(h.sector, (sectorExposure.get(h.sector) || 0) + h.weight);
  }
  for (const [sector, weight] of sectorExposure) {
    sections.push(`${sector}: ${weight.toFixed(1)}%`);
  }

  return sections.join('\n');
}

function formatRiskScores(data: unknown): string {
  const d = data as Record<string, unknown>;
  const scores = Array.isArray(d.scores) ? d.scores : Array.isArray(d.countries) ? d.countries : [];
  return scores
    .sort((a: unknown, b: unknown) => {
      const sa = typeof (a as Record<string, unknown>).score === 'number' ? (a as Record<string, unknown>).score as number : 0;
      const sb = typeof (b as Record<string, unknown>).score === 'number' ? (b as Record<string, unknown>).score as number : 0;
      return sb - sa;
    })
    .slice(0, 15)
    .map((s: unknown) => {
      const sc = s as Record<string, unknown>;
      const name = typeof sc.countryName === 'string' ? sc.countryName : typeof sc.name === 'string' ? sc.name : '?';
      const score = typeof sc.score === 'number' ? sc.score.toFixed(0) : typeof sc.cii === 'number' ? sc.cii.toFixed(0) : '?';
      return `${name}: ${score}/100`;
    })
    .join('\n');
}

export async function runGeopoliticalAgent(ctx: AgentContext): Promise<AgentResult<GeopoliticalReport>> {
  return runAgent({
    agentType: 'geopolitical',
    schema: GeopoliticalReportSchema,
    systemPrompt: GEOPOLITICAL_AGENT_PROMPT,
    buildPrompt,
    context: ctx,
  });
}
