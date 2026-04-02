/**
 * Redis-backed portfolio store for the trading agent system.
 * Uses Upstash REST API via the shared redis module.
 */

import { getCachedJson, setCachedJson } from '../../../_shared/redis';

const PORTFOLIO_TTL = 86400 * 30; // 30 days
const AGENT_STATE_TTL = 300; // 5 minutes (ephemeral)
const REPORT_TTL = 86400 * 30; // 30 days

// ---------------------------------------------------------------------------
// Types (mirror proto definitions without generated code dependency)
// ---------------------------------------------------------------------------

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
  assetType: 'equity' | 'etf' | 'crypto' | 'commodity' | 'bond';
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

export type AgentType =
  | 'orchestrator'
  | 'technical'
  | 'fundamental'
  | 'macro'
  | 'geopolitical'
  | 'sentiment'
  | 'risk_quant';

export type AgentStatusValue = 'idle' | 'thinking' | 'done' | 'error';

export interface AgentState {
  agentType: AgentType;
  status: AgentStatusValue;
  confidence: number;
  signal: string;
  lastAnalysisAt: string;
  summary: string;
}

export interface ConsensusResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  conviction: number;
  action: string;
  reasoning: string;
  riskWarning: string;
  agentStates: AgentState[];
}

export interface TradingReport {
  id: string;
  portfolioId: string;
  title: string;
  contentMarkdown: string;
  consensus: ConsensusResult;
  agentStates: AgentState[];
  generatedAt: string;
  reportType: string;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function portfolioKey(userId: string, portfolioId?: string): string {
  return portfolioId
    ? `trading:portfolio:${userId}:${portfolioId}`
    : `trading:portfolio:${userId}:default`;
}

function agentStateKey(portfolioId: string): string {
  return `trading:agents:${portfolioId}`;
}

function reportsKey(portfolioId: string): string {
  return `trading:reports:${portfolioId}`;
}

function reportKey(reportId: string): string {
  return `trading:report:${reportId}`;
}

// ---------------------------------------------------------------------------
// Portfolio CRUD
// ---------------------------------------------------------------------------

function defaultPortfolio(userId: string): TradingPortfolio {
  const now = new Date().toISOString();
  return {
    id: 'default',
    userId,
    name: 'My Portfolio',
    cash: 100_000,
    currency: 'USD',
    holdings: [],
    tradeHistory: [],
    performance: {
      dailyReturn: 0, weeklyReturn: 0, monthlyReturn: 0,
      ytdReturn: 0, allTimeReturn: 0, totalValue: 100_000, totalCost: 100_000,
    },
    riskMetrics: {
      sharpeRatio: 0, maxDrawdown: 0, portfolioBeta: 0,
      var95: 0, concentrationRisk: 0, cashPct: 100,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export async function getPortfolio(userId: string, portfolioId?: string): Promise<TradingPortfolio> {
  const key = portfolioKey(userId, portfolioId);
  const cached = await getCachedJson(key, true) as TradingPortfolio | null;
  if (cached) return cached;
  const fresh = defaultPortfolio(userId);
  await setCachedJson(key, fresh, PORTFOLIO_TTL);
  return fresh;
}

export async function savePortfolio(portfolio: TradingPortfolio): Promise<void> {
  portfolio.updatedAt = new Date().toISOString();
  const key = portfolioKey(portfolio.userId, portfolio.id);
  await setCachedJson(key, portfolio, PORTFOLIO_TTL);
}

/** Recalculate derived fields (market value, P&L, weights, performance, risk). */
export function recalcPortfolio(portfolio: TradingPortfolio): TradingPortfolio {
  let totalMarketValue = 0;
  for (const h of portfolio.holdings) {
    h.marketValue = h.quantity * h.currentPrice;
    h.unrealizedPnl = (h.currentPrice - h.avgCostBasis) * h.quantity;
    h.unrealizedPnlPct = h.avgCostBasis > 0
      ? ((h.currentPrice - h.avgCostBasis) / h.avgCostBasis) * 100
      : 0;
    totalMarketValue += h.marketValue;
  }

  const totalValue = totalMarketValue + portfolio.cash;
  for (const h of portfolio.holdings) {
    h.weight = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
  }

  portfolio.performance.totalValue = totalValue;
  portfolio.riskMetrics.cashPct = totalValue > 0
    ? (portfolio.cash / totalValue) * 100
    : 100;

  const maxWeight = Math.max(0, ...portfolio.holdings.map(h => h.weight));
  portfolio.riskMetrics.concentrationRisk = maxWeight;

  const totalCost = portfolio.performance.totalCost || portfolio.cash;
  portfolio.performance.allTimeReturn = totalCost > 0
    ? ((totalValue - totalCost) / totalCost) * 100
    : 0;

  return portfolio;
}

/** Apply a trade recommendation to the portfolio. */
export function applyTrade(
  portfolio: TradingPortfolio,
  symbol: string,
  name: string,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  reasoning: string,
  agentConsensus: number,
  triggeredBy: string,
  sector = '',
  assetType: PortfolioHolding['assetType'] = 'equity',
): TradingPortfolio {
  const tradeValue = quantity * price;

  if (side === 'buy') {
    if (tradeValue > portfolio.cash) {
      throw new Error(`Insufficient cash: need $${tradeValue.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`);
    }
    portfolio.cash -= tradeValue;
    const existing = portfolio.holdings.find(h => h.symbol === symbol);
    if (existing) {
      const totalCost = existing.avgCostBasis * existing.quantity + tradeValue;
      existing.quantity += quantity;
      existing.avgCostBasis = totalCost / existing.quantity;
    } else {
      portfolio.holdings.push({
        symbol, name, quantity, avgCostBasis: price,
        currentPrice: price, marketValue: tradeValue,
        unrealizedPnl: 0, unrealizedPnlPct: 0, weight: 0,
        sector, assetType,
      });
    }
  } else {
    const existing = portfolio.holdings.find(h => h.symbol === symbol);
    if (!existing || existing.quantity < quantity) {
      throw new Error(`Cannot sell ${quantity} of ${symbol}: only hold ${existing?.quantity ?? 0}`);
    }
    existing.quantity -= quantity;
    portfolio.cash += tradeValue;
    if (existing.quantity === 0) {
      portfolio.holdings = portfolio.holdings.filter(h => h.symbol !== symbol);
    }
  }

  const trade: TradeRecord = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol, side, quantity, price,
    reasoning, agentConsensus, triggeredBy,
  };
  portfolio.tradeHistory.unshift(trade);
  if (portfolio.tradeHistory.length > 200) {
    portfolio.tradeHistory = portfolio.tradeHistory.slice(0, 200);
  }

  return recalcPortfolio(portfolio);
}

// ---------------------------------------------------------------------------
// Agent State
// ---------------------------------------------------------------------------

export async function getAgentStates(portfolioId: string): Promise<AgentState[]> {
  const cached = await getCachedJson(agentStateKey(portfolioId), true) as AgentState[] | null;
  return cached ?? [];
}

export async function saveAgentStates(portfolioId: string, states: AgentState[]): Promise<void> {
  await setCachedJson(agentStateKey(portfolioId), states, AGENT_STATE_TTL);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function saveReport(report: TradingReport): Promise<void> {
  await setCachedJson(reportKey(report.id), report, REPORT_TTL);

  const listKey = reportsKey(report.portfolioId);
  const existing = (await getCachedJson(listKey, true) as string[] | null) ?? [];
  existing.unshift(report.id);
  const trimmed = existing.slice(0, 50);
  await setCachedJson(listKey, trimmed, REPORT_TTL);
}

export async function getReport(reportId: string): Promise<TradingReport | null> {
  return (await getCachedJson(reportKey(reportId), true)) as TradingReport | null;
}

export async function listReportIds(portfolioId: string, limit = 20): Promise<string[]> {
  const ids = (await getCachedJson(reportsKey(portfolioId), true) as string[] | null) ?? [];
  return ids.slice(0, limit);
}
