/**
 * Trading context assembler.
 *
 * Fetches live data from all relevant WorldMonitor domains via Redis,
 * then packages it as raw domain data that specialist agents can consume.
 * Extends the chat-analyst-context pattern with deeper market/economic coverage.
 */

import { getCachedJsonBatch } from '../../../_shared/redis';
import { sanitizeHeadline } from '../../../_shared/llm-sanitize.js';
import { CHROME_UA } from '../../../_shared/constants';

// Redis keys written by seed scripts and bootstrap hydration
const REDIS_KEYS = {
  stocks: 'market:stocks-bootstrap:v1',
  commodities: 'market:commodities-bootstrap:v1',
  sectorSummary: 'market:sectors-bootstrap:v1',
  etfFlows: 'market:etf-flows-bootstrap:v1',
  fearGreed: 'market:fear-greed-bootstrap:v1',
  cryptoQuotes: 'market:crypto-bootstrap:v1',
  stablecoins: 'market:stablecoins-bootstrap:v1',
  earningsCalendar: 'market:earnings-calendar:v1',
  cotPositioning: 'market:cot-positioning:v1',

  macroSignals: 'economic:macro-signals:v1',
  fredBatch: 'economic:fred-batch:v1',
  yieldCurve: 'economic:eu-yield-curve:v1',
  economicStress: 'economic:stress:v1',
  bisData: 'economic:bis-policy-rates:v1',
  energyStorage: 'economic:crude-storage:v1',
  gasStorage: 'economic:gas-storage:v1',
  nationalDebt: 'economic:national-debt:v1',
  economicCalendar: 'economic:calendar:v1',

  riskScores: 'risk:scores:sebuf:stale:v1',
  theaterPosture: 'intelligence:theater-posture:v1',
  conflicts: 'conflict:acled-events:v1',
  sanctionsPressure: 'sanctions:pressure:v1',
  crossSourceSignals: 'intelligence:cross-source-signals:v1',
  marketImplications: 'intelligence:market-implications:v1',
  supplyChainStress: 'supply-chain:stress:v1',

  insights: 'news:insights:v1',
  predictions: 'prediction:markets-bootstrap:v1',
  forecasts: 'forecast:predictions:v2',
  socialVelocity: 'intelligence:social:reddit:v1',

  tradePolicy: 'trade:customs-revenue:v1',
  correlations: 'intelligence:correlations:v1',
} as const;

export interface TradingDomainData {
  // Market
  marketQuotes: unknown;
  commodityQuotes: unknown;
  sectorSummary: unknown;
  etfFlows: unknown;
  fearGreedIndex: unknown;
  cryptoQuotes: unknown;
  stablecoins: unknown;
  earningsCalendar: unknown;
  cotPositioning: unknown;

  // Technical (populated per-request when symbols are specified)
  technicalAnalysis: unknown;

  // Macro/Economic
  macroSignals: unknown;
  fredBatch: unknown;
  yieldCurve: unknown;
  economicStress: unknown;
  bisData: unknown;
  energyStorage: unknown;
  economicCalendar: unknown;
  tradePolicy: unknown;

  // Geopolitical
  riskScores: unknown;
  theaterPosture: unknown;
  conflicts: unknown;
  sanctionsPressure: unknown;
  crossSourceSignals: unknown;
  marketImplications: unknown;
  supplyChainStress: unknown;

  // Sentiment/News
  liveHeadlines: unknown;
  dailyMarketBrief: unknown;
  predictionMarkets: unknown;
  socialVelocity: unknown;

  // Portfolio-adjacent
  correlations: unknown;
  forecasts: unknown;
}

/**
 * Fetch all domain data in a single Redis pipeline batch.
 * Returns raw parsed JSON for each domain key; agents format their own context.
 */
export async function assembleTradingContext(
  agentsNeeded: string[],
): Promise<TradingDomainData> {
  const keysToFetch = selectKeysForAgents(agentsNeeded);

  const batchResult = await getCachedJsonBatch(
    keysToFetch.map(([, redisKey]) => redisKey),
  );

  const data: Record<string, unknown> = {};
  for (const [field, redisKey] of keysToFetch) {
    data[field] = batchResult.get(redisKey) ?? null;
  }

  // Always fetch live headlines (GDELT, not Redis)
  const headlines = await fetchLiveHeadlines();
  data.liveHeadlines = headlines;

  // Build daily brief from insights
  if (data.insights) {
    data.dailyMarketBrief = formatBriefFromInsights(data.insights);
  }

  return data as unknown as TradingDomainData;
}

/**
 * Select which Redis keys to fetch based on which agents are requested.
 * This avoids fetching geopolitical data when only technical analysis is needed.
 */
function selectKeysForAgents(agents: string[]): Array<[string, string]> {
  const agentSet = new Set(agents);
  const keys: Array<[string, string]> = [];

  // Always fetch core market data
  keys.push(
    ['marketQuotes', REDIS_KEYS.stocks],
    ['commodityQuotes', REDIS_KEYS.commodities],
    ['fearGreedIndex', REDIS_KEYS.fearGreed],
    ['marketImplications', REDIS_KEYS.marketImplications],
    ['forecasts', REDIS_KEYS.forecasts],
    ['correlations', REDIS_KEYS.correlations],
  );

  if (agentSet.has('technical') || agentSet.has('fundamental')) {
    keys.push(
      ['sectorSummary', REDIS_KEYS.sectorSummary],
      ['etfFlows', REDIS_KEYS.etfFlows],
      ['earningsCalendar', REDIS_KEYS.earningsCalendar],
      ['cotPositioning', REDIS_KEYS.cotPositioning],
      ['cryptoQuotes', REDIS_KEYS.cryptoQuotes],
      ['stablecoins', REDIS_KEYS.stablecoins],
    );
  }

  if (agentSet.has('macro')) {
    keys.push(
      ['macroSignals', REDIS_KEYS.macroSignals],
      ['fredBatch', REDIS_KEYS.fredBatch],
      ['yieldCurve', REDIS_KEYS.yieldCurve],
      ['economicStress', REDIS_KEYS.economicStress],
      ['bisData', REDIS_KEYS.bisData],
      ['energyStorage', REDIS_KEYS.energyStorage],
      ['economicCalendar', REDIS_KEYS.economicCalendar],
      ['tradePolicy', REDIS_KEYS.tradePolicy],
    );
  }

  if (agentSet.has('geopolitical')) {
    keys.push(
      ['riskScores', REDIS_KEYS.riskScores],
      ['theaterPosture', REDIS_KEYS.theaterPosture],
      ['conflicts', REDIS_KEYS.conflicts],
      ['sanctionsPressure', REDIS_KEYS.sanctionsPressure],
      ['crossSourceSignals', REDIS_KEYS.crossSourceSignals],
      ['supplyChainStress', REDIS_KEYS.supplyChainStress],
    );
  }

  if (agentSet.has('sentiment')) {
    keys.push(
      ['predictionMarkets', REDIS_KEYS.predictions],
      ['socialVelocity', REDIS_KEYS.socialVelocity],
      ['insights', REDIS_KEYS.insights],
    );
  }

  return keys;
}

async function fetchLiveHeadlines(): Promise<unknown[]> {
  try {
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('maxrecords', '12');
    url.searchParams.set('query', 'financial markets economy stocks trading');
    url.searchParams.set('format', 'json');
    url.searchParams.set('timespan', '4h');
    url.searchParams.set('sort', 'DateDesc');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(3_000),
    });

    if (!res.ok) return [];

    const data = await res.json() as { articles?: Array<{ title?: string; domain?: string; seendate?: string }> };
    return (data.articles ?? []).slice(0, 12).map((a) => ({
      title: sanitizeHeadline(a.title ?? ''),
      source: (a.domain ?? '').slice(0, 60),
      date: a.seendate ?? '',
    })).filter((a) => a.title);
  } catch {
    return [];
  }
}

function formatBriefFromInsights(insights: unknown): string {
  if (!insights || typeof insights !== 'object') return '';
  const d = insights as Record<string, unknown>;
  const parts: string[] = [];

  const brief = typeof d.brief === 'string' ? d.brief : typeof d.summary === 'string' ? d.summary : '';
  if (brief) parts.push(brief.slice(0, 800));

  const stories = Array.isArray(d.topStories) ? d.topStories : Array.isArray(d.stories) ? d.stories : [];
  for (const s of stories.slice(0, 8)) {
    const story = s as Record<string, unknown>;
    const title = typeof story.headline === 'string' ? story.headline : typeof story.title === 'string' ? story.title : '';
    if (title) parts.push(`- ${sanitizeHeadline(title)}`);
  }

  return parts.join('\n');
}
