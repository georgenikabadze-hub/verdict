/**
 * Google Generative Language (Gemini) REST client (server-side only).
 *
 * - Single endpoint: generateContent on the chosen model (default gemini-2.5-flash)
 * - Always asks for JSON (responseMimeType: application/json)
 * - Validates the parsed payload against a Zod schema
 * - On validation failure, retries ONCE with `responseSchema` derived from the
 *   Zod schema appended to generationConfig
 * - On timeout/error, returns `{ data: null, apiStatus: { status: error|timeout } }`
 *   so callers can fall back deterministically
 */

import type { ZodSchema, ZodTypeAny } from "zod";
import type { ApiStatus } from "../contracts";
import { withTimeout, DEFAULT_TIMEOUT_MS } from "./timeout";

const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface GeminiStructuredResult<T> {
  data: T | null;
  apiStatus: ApiStatus;
}

interface GenerationConfig {
  responseMimeType: "application/json";
  responseSchema?: unknown;
}

interface GeminiRequestBody {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: GenerationConfig;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

function getKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return key;
}

function endpointFor(model: string): string {
  return `${ENDPOINT_BASE}/${model}:generateContent?key=${encodeURIComponent(getKey())}`;
}

function extractText(json: GeminiResponse): string | null {
  const parts = json.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) return null;
  const text = parts.map((p) => p.text ?? "").join("");
  return text.length > 0 ? text : null;
}

function tryParseJson(text: string): unknown {
  // Gemini often wraps JSON in ```json ... ``` fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

/**
 * Best-effort Zod -> Gemini responseSchema translator.
 *
 * Gemini accepts a JSON-Schema-ish subset. We try to use the schema's `_def`
 * to convert; if that fails we just omit responseSchema and rely on the prompt
 * to coerce the model to valid JSON.
 */
function zodToResponseSchema(schema: ZodTypeAny): unknown | undefined {
  try {
    // Optional: only if the user has zod-to-json-schema installed. We avoid
    // adding a hard dep — fall back to undefined if it isn't available.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("zod-to-json-schema") as {
      zodToJsonSchema: (s: ZodTypeAny) => unknown;
    };
    return mod.zodToJsonSchema(schema);
  } catch {
    return undefined;
  }
}

async function postOnce(
  model: string,
  body: GeminiRequestBody,
  signal: AbortSignal,
): Promise<GeminiResponse> {
  const res = await fetch(endpointFor(model), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GeminiResponse;
}

/**
 * Run a Gemini call. Validates against `schema`. Retries ONCE on validation
 * failure with `responseSchema` set, then gives up and returns null data.
 */
async function runGemini<T>(
  prompt: string,
  schema: ZodSchema<T>,
  model: string,
  signal: AbortSignal,
): Promise<T> {
  const baseBody: GeminiRequestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  };

  // Attempt 1: plain JSON request.
  const first = await postOnce(model, baseBody, signal);
  const firstText = extractText(first);
  if (firstText) {
    try {
      const parsed = tryParseJson(firstText);
      const ok = schema.safeParse(parsed);
      if (ok.success) return ok.data;
    } catch {
      // fall through to retry
    }
  }

  // Attempt 2: include responseSchema for stricter coercion.
  const responseSchema = zodToResponseSchema(schema as ZodTypeAny);
  const retryBody: GeminiRequestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {}),
    },
  };
  const second = await postOnce(model, retryBody, signal);
  const secondText = extractText(second);
  if (!secondText) {
    throw new Error("Gemini returned no text on retry");
  }
  const parsedRetry = tryParseJson(secondText);
  const okRetry = schema.safeParse(parsedRetry);
  if (!okRetry.success) {
    throw new Error(`Gemini response failed schema validation: ${okRetry.error.message}`);
  }
  return okRetry.data;
}

export async function callGeminiStructured<T>(
  prompt: string,
  schema: ZodSchema<T>,
  model: string = DEFAULT_MODEL,
): Promise<GeminiStructuredResult<T>> {
  const controller = new AbortController();
  const live = runGemini<T>(prompt, schema, model, controller.signal);

  const fallback = (): T | null => {
    controller.abort();
    return null;
  };

  const out = await withTimeout<T | null>(live, DEFAULT_TIMEOUT_MS, fallback);

  return {
    data: out.result,
    apiStatus: {
      source: out.source,
      status: out.status,
      latencyMs: out.latencyMs,
      message: out.message,
    },
  };
}
