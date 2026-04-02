/**
 * Trading report edge function — Pro only.
 *
 * GET /api/trading-report?reportId=...              — Fetch a specific report
 * GET /api/trading-report?portfolioId=...&limit=20  — List report IDs
 */

export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
import { isCallerPremium } from '../server/_shared/premium-check';
import { getReport, listReportIds } from '../server/worldmonitor/trading/v1/portfolio-store';

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
      },
    });
  }

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const isPremium = await isCallerPremium(req);
  if (!isPremium) {
    return json({ error: 'Pro subscription required' }, 403, corsHeaders);
  }

  const url = new URL(req.url);
  const reportId = url.searchParams.get('reportId');
  const portfolioId = url.searchParams.get('portfolioId');

  if (reportId) {
    const report = await getReport(reportId);
    if (!report) return json({ error: 'Report not found' }, 404, corsHeaders);
    return json({ report }, 200, corsHeaders);
  }

  if (portfolioId) {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 50);
    const ids = await listReportIds(portfolioId, limit);
    return json({ reportIds: ids }, 200, corsHeaders);
  }

  return json({ error: 'reportId or portfolioId query param required' }, 400, corsHeaders);
}
