/**
 * Client-side trading agent service.
 * Handles SSE chat streaming, portfolio CRUD, and report fetching.
 */

import { premiumFetch } from '@/services/premium-fetch';

const AGENT_URL = '/api/trading-agent';
const PORTFOLIO_URL = '/api/trading-portfolio';
const REPORT_URL = '/api/trading-report';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentMeta {
  intent: string;
  agents: string[];
  symbols: string[];
  agentStates: Array<{
    agent: string;
    status: string;
    confidence: number;
    signal: string;
  }>;
}

export interface TradingPortfolio {
  id: string;
  userId: string;
  name: string;
  cash: number;
  currency: string;
  holdings: PortfolioHolding[];
  tradeHistory: TradeRecord[];
  performance: PerformanceMetrics;
  riskMetrics: RiskMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioHolding {
  symbol: string;
  name: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  weight: number;
  sector: string;
  assetType: string;
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  reasoning: string;
  agentConsensus: number;
  triggeredBy: string;
}

export interface PerformanceMetrics {
  dailyReturn: number;
  weeklyReturn: number;
  monthlyReturn: number;
  ytdReturn: number;
  allTimeReturn: number;
  totalValue: number;
  totalCost: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  maxDrawdown: number;
  portfolioBeta: number;
  var95: number;
  concentrationRisk: number;
  cashPct: number;
}

export interface StreamCallbacks {
  onMeta?: (meta: AgentMeta) => void;
  onDelta?: (text: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Chat streaming
// ---------------------------------------------------------------------------

export async function streamTradingChat(
  query: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  portfolioId?: string,
): Promise<void> {
  try {
    const resp = await premiumFetch(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history, portfolioId }),
      signal,
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => 'Unknown error');
      callbacks.onError?.(`HTTP ${resp.status}: ${err}`);
      return;
    }

    if (!resp.body) {
      callbacks.onError?.('No response stream');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;
          if (event.meta) callbacks.onMeta?.(event.meta as AgentMeta);
          else if (typeof event.delta === 'string') callbacks.onDelta?.(event.delta);
          else if (event.done) callbacks.onDone?.();
          else if (typeof event.error === 'string') callbacks.onError?.(event.error);
        } catch { /* skip malformed */ }
      }
    }

    // If no done event was received, fire one
    callbacks.onDone?.();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError?.((err as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export async function fetchPortfolio(portfolioId?: string): Promise<TradingPortfolio> {
  const url = portfolioId
    ? `${PORTFOLIO_URL}?portfolioId=${encodeURIComponent(portfolioId)}`
    : PORTFOLIO_URL;
  const resp = await premiumFetch(url);
  const data = await resp.json() as { portfolio: TradingPortfolio };
  return data.portfolio;
}

export async function updatePortfolio(
  updates: Partial<TradingPortfolio> & { action?: string },
): Promise<TradingPortfolio> {
  const resp = await premiumFetch(PORTFOLIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await resp.json() as { portfolio: TradingPortfolio };
  return data.portfolio;
}

export async function executeTrade(trade: {
  symbol: string;
  name?: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  reasoning?: string;
  agentConsensus?: number;
}): Promise<TradingPortfolio> {
  const resp = await premiumFetch(PORTFOLIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...trade, action: 'trade', triggeredBy: 'user' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Trade failed' })) as { error?: string };
    throw new Error(err.error ?? 'Trade failed');
  }
  const data = await resp.json() as { portfolio: TradingPortfolio };
  return data.portfolio;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface TradingReport {
  id: string;
  portfolioId: string;
  title: string;
  contentMarkdown: string;
  generatedAt: string;
  reportType: string;
}

export async function fetchReport(reportId: string): Promise<TradingReport> {
  const resp = await premiumFetch(`${REPORT_URL}?reportId=${encodeURIComponent(reportId)}`);
  const data = await resp.json() as { report: TradingReport };
  return data.report;
}

export async function listReportIds(portfolioId: string, limit = 20): Promise<string[]> {
  const resp = await premiumFetch(
    `${REPORT_URL}?portfolioId=${encodeURIComponent(portfolioId)}&limit=${limit}`,
  );
  const data = await resp.json() as { reportIds: string[] };
  return data.reportIds;
}
