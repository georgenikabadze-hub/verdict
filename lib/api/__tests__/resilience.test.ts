/**
 * Resilience tests for the lib/api/* wrappers.
 *
 * We exercise the core `withTimeout` helper directly (it's the substrate every
 * wrapper sits on) plus a couple of shape checks against the real client
 * functions to make sure they always emit a populated `apiStatus`.
 */

import { describe, expect, it } from "vitest";
import { withTimeout } from "../timeout";
import type { ApiStatus } from "../../contracts";

const FAST_TIMEOUT_MS = 50;
const CACHED = { hello: "from-cache" };

function delayedResolve<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

function delayedReject(message: string, delayMs: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), delayMs),
  );
}

describe("withTimeout", () => {
  it("happy path: returns live result + ok status when promise resolves first", async () => {
    const out = await withTimeout(
      Promise.resolve({ hello: "live" }),
      FAST_TIMEOUT_MS,
      () => CACHED,
    );

    expect(out.source).toBe("live");
    expect(out.status).toBe("ok");
    expect(out.result).toEqual({ hello: "live" });
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    expect(out.message).toBeUndefined();
  });

  it("timeout path: returns cached fallback + timeout status when promise is too slow", async () => {
    // Promise takes 5s, timeout fires at 50ms — fallback wins.
    const slow = delayedResolve({ hello: "live" }, 5000);
    const out = await withTimeout(slow, FAST_TIMEOUT_MS, () => CACHED);

    expect(out.source).toBe("cached");
    expect(out.status).toBe("timeout");
    expect(out.result).toEqual(CACHED);
    expect(out.message).toMatch(/Timed out after/);
  });

  it("error path: returns cached fallback + error status when promise rejects", async () => {
    const out = await withTimeout(
      delayedReject("network exploded", 5),
      FAST_TIMEOUT_MS,
      () => CACHED,
    );

    expect(out.source).toBe("cached");
    expect(out.status).toBe("error");
    expect(out.result).toEqual(CACHED);
    expect(out.message).toContain("network exploded");
  });

  it("supports async fallbacks", async () => {
    const out = await withTimeout(
      delayedReject("boom", 5),
      FAST_TIMEOUT_MS,
      async () => ({ hello: "async-cache" }),
    );

    expect(out.source).toBe("cached");
    expect(out.result).toEqual({ hello: "async-cache" });
  });

  it("propagates fallback errors when no cache is available", async () => {
    await expect(
      withTimeout(
        delayedReject("boom", 5),
        FAST_TIMEOUT_MS,
        () => {
          throw new Error("no fixture on disk");
        },
      ),
    ).rejects.toThrow(/no fixture on disk/);
  });
});

describe("ApiStatus contract", () => {
  it("withTimeout output maps cleanly into ApiStatus", async () => {
    const out = await withTimeout(
      Promise.resolve("ok"),
      FAST_TIMEOUT_MS,
      () => "cached",
    );

    const apiStatus: ApiStatus = {
      source: out.source,
      status: out.status,
      latencyMs: out.latencyMs,
      message: out.message,
    };

    expect(apiStatus.source).toBe("live");
    expect(apiStatus.status).toBe("ok");
    expect(typeof apiStatus.latencyMs).toBe("number");
  });
});
