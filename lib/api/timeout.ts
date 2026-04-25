/**
 * Timeout helper for API calls. Races a promise against a timer and falls back
 * to a synchronous-or-async fallback if the timer wins or the promise rejects.
 *
 * Used by every wrapper in lib/api/* to enforce the 4s budget.
 */

export type WithTimeoutStatus = "ok" | "timeout" | "error";
export type WithTimeoutSource = "live" | "cached";

export interface WithTimeoutResult<T> {
  result: T;
  source: WithTimeoutSource;
  latencyMs: number;
  status: WithTimeoutStatus;
  message?: string;
}

export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Race `promise` against a `ms`-millisecond timer.
 *
 * - On promise resolve before the timer: returns `{ source: "live", status: "ok" }`
 * - On timer first: invokes `fallback()` and returns `{ source: "cached", status: "timeout" }`
 * - On promise reject: invokes `fallback()` and returns `{ source: "cached", status: "error" }`
 *
 * The fallback is responsible for surfacing cached fixtures (or throwing if no
 * cache is available — in which case the error propagates).
 *
 * Note: callers that need true network abort should pass an AbortController's
 * signal to their fetch and call `controller.abort()` from the fallback path.
 * This helper itself only races; it cannot abort an arbitrary promise.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: () => T | Promise<T>,
): Promise<WithTimeoutResult<T>> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms}ms`)), ms);
  });

  try {
    const value = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return {
      result: value,
      source: "live",
      latencyMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const isTimeout = err instanceof TimeoutError;
    const message = err instanceof Error ? err.message : String(err);
    const fallbackValue = await fallback();
    return {
      result: fallbackValue,
      source: "cached",
      latencyMs: Date.now() - start,
      status: isTimeout ? "timeout" : "error",
      message,
    };
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
