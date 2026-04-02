/**
 * Streaming trading agent edge function — Pro only.
 *
 * POST /api/trading-agent
 * Body: { history: {role,content}[], query: string, portfolioId?: string }
 *
 * Returns text/event-stream SSE:
 *   data: {"meta":{intent,agents,symbols,agentStates}}  — first event (agent selection + status)
 *   data: {"delta":"..."}    — one per content token (orchestrator synthesis)
 *   data: {"done":true}      — terminal event
 *   data: {"error":"..."}    — on auth/llm failure
 */

export const config = { runtime: 'edge', regions: ['iad1', 'lhr1', 'fra1', 'sfo1'] };

// @ts-expect-error — JS module, no declaration file
import { getCorsHeaders } from './_cors.js';
import { isCallerPremium } from '../server/_shared/premium-check';
import { checkRateLimit } from '../server/_shared/rate-limit';
import { sanitizeForPrompt } from '../server/_shared/llm-sanitize.js';
import { orchestrate } from '../server/worldmonitor/trading/v1/orchestrator';

const MAX_QUERY_LEN = 1000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 800;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TradingAgentRequestBody {
  history?: unknown[];
  query?: unknown;
  portfolioId?: unknown;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function extractUserId(req: Request): string {
  const auth = req.headers.get('Authorization') ?? '';
  const key = req.headers.get('X-WorldMonitor-Key') ?? '';
  return key || auth.slice(0, 32) || 'anonymous';
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req) as Record<string, string>;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const isPremium = await isCallerPremium(req);
  if (!isPremium) {
    return json({ error: 'Pro subscription required' }, 403, corsHeaders);
  }

  const rateLimitResponse = await checkRateLimit(req, corsHeaders);
  if (rateLimitResponse) return rateLimitResponse;

  let body: TradingAgentRequestBody;
  try {
    body = (await req.json()) as TradingAgentRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const rawQuery = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_LEN) : '';
  if (!rawQuery) return json({ error: 'query is required' }, 400, corsHeaders);

  const query = sanitizeForPrompt(rawQuery);
  if (!query) return json({ error: 'query is required' }, 400, corsHeaders);

  const portfolioId = typeof body.portfolioId === 'string'
    ? body.portfolioId.trim().slice(0, 64)
    : undefined;

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatMessage[] = rawHistory
    .filter((m): m is ChatMessage => {
      if (!m || typeof m !== 'object') return false;
      const msg = m as Record<string, unknown>;
      return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
    })
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => {
      const sanitized = sanitizeForPrompt(m.content.slice(0, MAX_MESSAGE_CHARS)) ?? '';
      return { role: m.role, content: sanitized };
    })
    .filter((m) => m.content.length > 0);

  const userId = extractUserId(req);

  try {
    const result = await orchestrate({
      userId,
      portfolioId,
      query,
      history,
    });

    return new Response(result.stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error('[trading-agent] Orchestration failed:', err);
    const enc = new TextEncoder();
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'orchestration_failed' })}\n\n`));
        controller.close();
      },
    });

    return new Response(errorStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        ...corsHeaders,
      },
    });
  }
}
