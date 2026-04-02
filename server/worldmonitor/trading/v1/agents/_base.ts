/**
 * Base interface and runner for trading specialist agents.
 * Each agent fetches domain data, builds a prompt context, and calls
 * generateObject with a Zod schema for structured output.
 */

import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import { getAvailableModel } from '../../../../_shared/ai-providers';
import type { TradingPortfolio, AgentType } from '../portfolio-store';

export interface AgentContext {
  query: string;
  symbols: string[];
  portfolio: TradingPortfolio;
  /** Extra data passed from the context assembler, keyed by domain. */
  domainData: Record<string, unknown>;
}

export interface AgentResult<T> {
  agentType: AgentType;
  report: T;
  durationMs: number;
  model: string;
  error?: string;
}

/**
 * Run a specialist agent with timeout, error handling, and metrics.
 * Returns a typed AgentResult even on failure (with a fallback report).
 */
export async function runAgent<T>(opts: {
  agentType: AgentType;
  schema: z.ZodType<T>;
  systemPrompt: string;
  buildPrompt: (ctx: AgentContext) => string;
  context: AgentContext;
  model?: LanguageModel;
  timeoutMs?: number;
  temperature?: number;
}): Promise<AgentResult<T>> {
  const {
    agentType,
    schema,
    systemPrompt,
    buildPrompt,
    context,
    timeoutMs = 30_000,
    temperature = 0.3,
  } = opts;

  const start = Date.now();
  const model = opts.model ?? getAvailableModel('fast');

  try {
    const prompt = buildPrompt(context);

    const { object, response } = await Promise.race([
      generateObject({
        model,
        schema,
        system: systemPrompt,
        prompt,
        temperature,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Agent timeout')), timeoutMs),
      ),
    ]);

    return {
      agentType,
      report: object,
      durationMs: Date.now() - start,
      model: response?.modelId ?? 'unknown',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[trading:${agentType}] Agent failed: ${msg}`);

    return {
      agentType,
      report: undefined as unknown as T,
      durationMs: Date.now() - start,
      model: 'error',
      error: msg,
    };
  }
}
