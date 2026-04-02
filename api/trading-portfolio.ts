/**
 * Trading portfolio CRUD edge function — Pro only.
 *
 * GET  /api/trading-portfolio?portfolioId=...  — Fetch portfolio
 * POST /api/trading-portfolio                  — Update portfolio (holdings, cash, name)
 */

export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
import { isCallerPremium } from '../server/_shared/premium-check';
import {
  getPortfolio,
  savePortfolio,
  recalcPortfolio,
  applyTrade,
} from '../server/worldmonitor/trading/v1/portfolio-store';

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function extractUserId(req: Request): string {
  const key = req.headers.get('X-WorldMonitor-Key') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  return key || auth.slice(0, 32) || 'anonymous';
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
      },
    });
  }

  const isPremium = await isCallerPremium(req);
  if (!isPremium) {
    return json({ error: 'Pro subscription required' }, 403, corsHeaders);
  }

  const userId = extractUserId(req);

  // GET — fetch portfolio
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const portfolioId = url.searchParams.get('portfolioId') ?? undefined;
    const portfolio = await getPortfolio(userId, portfolioId);
    return json({ portfolio }, 200, corsHeaders);
  }

  // POST — update portfolio or execute trade
  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
    }

    const action = typeof body.action === 'string' ? body.action : 'update';
    const portfolioId = typeof body.portfolioId === 'string' ? body.portfolioId : undefined;
    let portfolio = await getPortfolio(userId, portfolioId);

    if (action === 'trade') {
      const symbol = typeof body.symbol === 'string' ? body.symbol : '';
      const name = typeof body.name === 'string' ? body.name : symbol;
      const side = body.side === 'sell' ? 'sell' as const : 'buy' as const;
      const quantity = typeof body.quantity === 'number' ? body.quantity : 0;
      const price = typeof body.price === 'number' ? body.price : 0;
      const reasoning = typeof body.reasoning === 'string' ? body.reasoning : '';
      const consensus = typeof body.agentConsensus === 'number' ? body.agentConsensus : 0;
      const triggeredBy = typeof body.triggeredBy === 'string' ? body.triggeredBy : 'user';

      if (!symbol || quantity <= 0 || price <= 0) {
        return json({ error: 'symbol, quantity, and price are required' }, 400, corsHeaders);
      }

      try {
        portfolio = applyTrade(portfolio, symbol, name, side, quantity, price, reasoning, consensus, triggeredBy);
        await savePortfolio(portfolio);
        return json({ portfolio }, 200, corsHeaders);
      } catch (err) {
        return json({ error: (err as Error).message }, 400, corsHeaders);
      }
    }

    // Generic update (name, cash, holdings import)
    if (typeof body.name === 'string') portfolio.name = body.name;
    if (typeof body.cash === 'number') portfolio.cash = body.cash;

    if (Array.isArray(body.holdings)) {
      portfolio.holdings = (body.holdings as Record<string, unknown>[]).map((h) => ({
        symbol: typeof h.symbol === 'string' ? h.symbol : '',
        name: typeof h.name === 'string' ? h.name : '',
        quantity: typeof h.quantity === 'number' ? h.quantity : 0,
        avgCostBasis: typeof h.avgCostBasis === 'number' ? h.avgCostBasis : 0,
        currentPrice: typeof h.currentPrice === 'number' ? h.currentPrice : typeof h.avgCostBasis === 'number' ? h.avgCostBasis : 0,
        marketValue: 0,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        weight: 0,
        sector: typeof h.sector === 'string' ? h.sector : '',
        assetType: (['equity', 'etf', 'crypto', 'commodity', 'bond'].includes(h.assetType as string)
          ? h.assetType : 'equity') as 'equity' | 'etf' | 'crypto' | 'commodity' | 'bond',
      })).filter((h) => h.symbol && h.quantity > 0);
    }

    portfolio = recalcPortfolio(portfolio);
    await savePortfolio(portfolio);
    return json({ portfolio }, 200, corsHeaders);
  }

  return json({ error: 'Method not allowed' }, 405, corsHeaders);
}
