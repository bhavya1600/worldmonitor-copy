/**
 * Vercel AI SDK provider wrappers.
 *
 * Re-uses the same env vars as llm.ts (GROQ_API_KEY, OPENROUTER_API_KEY,
 * OLLAMA_API_URL, etc.) but exposes them as AI SDK LanguageModel instances
 * for use with generateText / generateObject / streamText.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

// ---------------------------------------------------------------------------
// Provider factories (lazy — only created when credentials are present)
// ---------------------------------------------------------------------------

export function getGroqProvider() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey,
  });
}

export function getOpenRouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: {
      'HTTP-Referer': 'https://worldmonitor.app',
      'X-Title': 'World Monitor',
    },
  });
}

export function getOllamaProvider() {
  const baseUrl = process.env.OLLAMA_API_URL;
  if (!baseUrl) return null;
  const apiKey = process.env.OLLAMA_API_KEY;
  return createOpenAI({
    baseURL: new URL('/v1', baseUrl).toString(),
    apiKey: apiKey || 'ollama',
  });
}

export function getGenericProvider() {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!apiUrl || !apiKey) return null;
  const base = apiUrl.replace(/\/chat\/completions\/?$/, '');
  return createOpenAI({ baseURL: base, apiKey });
}

// ---------------------------------------------------------------------------
// Default model selectors
// ---------------------------------------------------------------------------

/** Fast model for structured output / extraction (specialist agents). */
export function getFastModel(): LanguageModel | null {
  const groq = getGroqProvider();
  if (groq) return groq('llama-3.1-70b-versatile');

  const or = getOpenRouterProvider();
  if (or) return or('meta-llama/llama-3.1-70b-instruct');

  const ollama = getOllamaProvider();
  if (ollama) return ollama(process.env.OLLAMA_MODEL || 'llama3.1:8b');

  return null;
}

/** Reasoning model for synthesis and user-facing responses (orchestrator). */
export function getReasoningModel(): LanguageModel | null {
  const or = getOpenRouterProvider();
  if (or) return or(process.env.LLM_REASONING_MODEL || 'google/gemini-2.5-flash');

  const groq = getGroqProvider();
  if (groq) return groq('llama-3.1-70b-versatile');

  const ollama = getOllamaProvider();
  if (ollama) return ollama(process.env.OLLAMA_MODEL || 'llama3.1:8b');

  return null;
}

/** Returns the first available model from the provider chain. */
export function getAvailableModel(
  preference: 'fast' | 'reasoning' = 'fast',
): LanguageModel {
  const model = preference === 'fast' ? getFastModel() : getReasoningModel();
  if (model) return model;

  const fallback = preference === 'fast' ? getReasoningModel() : getFastModel();
  if (fallback) return fallback;

  throw new Error('No LLM provider configured — set GROQ_API_KEY, OPENROUTER_API_KEY, or OLLAMA_API_URL');
}
