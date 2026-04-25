/**
 * Google Aerial View API client (server-side only).
 *
 * The Aerial View API returns a pre-rendered, cinematic 360° fly-by MP4 of any
 * address with photoreal-3D coverage. The flow is two-step:
 *
 *   1. GET videos:lookupVideo  → returns mp4 URL if a video has already been
 *      rendered (and is fresh — Google re-uses cached renders for ~30 days).
 *   2. If 404 NOT_FOUND, POST videos:renderVideo to enqueue rendering. Render
 *      jobs typically complete in 1–3 minutes; we DO NOT poll inside the
 *      request — the caller's UI shows "Generating cinematic…" and re-fetches.
 *
 * This wrapper uses the standard Verdict resilience pattern: 4-second budget
 * via withTimeout(), GOOGLE_MAPS_API_KEY (server-only), no fixture fallback
 * (Aerial View has no useful "cached" version — either the rendered video is
 * available or it isn't).
 *
 * Server-only. Never import from a client component.
 */

import { withTimeout, DEFAULT_TIMEOUT_MS } from "./timeout";

const LOOKUP_ENDPOINT = "https://aerialview.googleapis.com/v1/videos:lookupVideo";
const RENDER_ENDPOINT = "https://aerialview.googleapis.com/v1/videos:renderVideo";

export type AerialViewState = "ready" | "rendering" | "not_found" | "error";

export interface AerialVideoLookup {
  /** Direct MP4 URL when state="ready", otherwise null. */
  videoUrl: string | null;
  state: AerialViewState;
  /** Optional human-readable diagnostic — surfaced in dev / fallback UI. */
  message?: string;
}

interface LookupResponseUri {
  uri?: string;
  mediaType?: string;
}

interface LookupResponse {
  state?: string; // "PROCESSING" | "ACTIVE" | ...
  uris?: Record<string, LookupResponseUri>;
  metadata?: {
    videoFormat?: string;
    captureDate?: { year?: number; month?: number; day?: number };
  };
}

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set");
  }
  return key;
}

/** Pick the best MP4 URL from the API's `uris` map (an object keyed by format). */
function pickMp4Url(resp: LookupResponse): string | null {
  if (!resp || typeof resp !== "object") return null;
  const uris = resp.uris;
  if (!uris || typeof uris !== "object") return null;

  // The map keys are arbitrary format codes ("MP4_HIGH", "MP4_MEDIUM" etc.).
  // Prefer high-quality, then any MP4-typed entry, then anything with a uri.
  const entries = Object.entries(uris);
  const byKey = (needle: string) =>
    entries.find(([k]) => k.toUpperCase().includes(needle));

  const candidate =
    byKey("HIGH") ??
    byKey("MEDIUM") ??
    byKey("LOW") ??
    byKey("MP4") ??
    entries[0];

  const uri = candidate?.[1]?.uri;
  return typeof uri === "string" && uri.length > 0 ? uri : null;
}

/**
 * Look up (or trigger rendering of) the Aerial View fly-by for a given lat/lng.
 *
 * Returns immediately. The UI is responsible for re-polling this endpoint
 * every ~10s while state="rendering".
 */
export async function lookupAerialVideo(
  lat: number,
  lng: number,
): Promise<AerialVideoLookup> {
  let key: string;
  try {
    key = getKey();
  } catch (e) {
    return {
      videoUrl: null,
      state: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const lookupUrl =
    `${LOOKUP_ENDPOINT}?key=${encodeURIComponent(key)}` +
    `&address.latitude=${lat}` +
    `&address.longitude=${lng}`;

  const lookupController = new AbortController();
  const lookupPromise = (async (): Promise<AerialVideoLookup> => {
    const res = await fetch(lookupUrl, { signal: lookupController.signal });
    if (res.status === 404) {
      // No rendered video yet — kick off a render job. We do NOT poll; the
      // UI will re-call this endpoint until state transitions to "ready".
      return triggerRender(key, lat, lng);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        videoUrl: null,
        state: "error",
        message: `Aerial View HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as LookupResponse;
    const apiState = (json.state ?? "").toUpperCase();

    // ACTIVE / READY / etc. → video is available. Anything else → still rendering.
    if (apiState === "ACTIVE" || apiState === "READY") {
      const url = pickMp4Url(json);
      if (url) {
        return { videoUrl: url, state: "ready" };
      }
      return {
        videoUrl: null,
        state: "rendering",
        message: "Video metadata returned but no playable URI yet",
      };
    }
    if (apiState === "PROCESSING" || apiState === "PENDING" || apiState === "QUEUED") {
      return { videoUrl: null, state: "rendering" };
    }
    // Unknown state — surface the raw value for debugging.
    return {
      videoUrl: null,
      state: "rendering",
      message: apiState ? `Aerial View state: ${apiState}` : undefined,
    };
  })();

  const fallback = (): AerialVideoLookup => {
    lookupController.abort();
    return {
      videoUrl: null,
      state: "error",
      message: "Aerial View lookup timed out",
    };
  };

  const out = await withTimeout(lookupPromise, DEFAULT_TIMEOUT_MS, fallback);

  // If withTimeout caught a thrown error from lookupPromise, the fallback ran
  // and we have an error state. Otherwise out.result is whatever lookupPromise
  // returned (which already encodes its own state).
  if (out.status === "error" && out.result.state !== "error") {
    return {
      videoUrl: null,
      state: "error",
      message: out.message ?? "Aerial View lookup failed",
    };
  }
  return out.result;
}

/**
 * POST videos:renderVideo to enqueue a fresh fly-by render.
 *
 * The render job is fire-and-forget from our side — typical completion is
 * 1–3 minutes. We always return state="rendering" on success, and let the UI
 * re-poll the lookup endpoint to discover when the MP4 lands.
 */
async function triggerRender(
  key: string,
  lat: number,
  lng: number,
): Promise<AerialVideoLookup> {
  const url = `${RENDER_ENDPOINT}?key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: { latitude: lat, longitude: lng },
      }),
    });
    if (res.status === 404) {
      // The address is outside Aerial View coverage (no photoreal 3D mesh).
      return {
        videoUrl: null,
        state: "not_found",
        message: "No Aerial View coverage at these coordinates",
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        videoUrl: null,
        state: "error",
        message: `Aerial View render HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    // Accepted (200/202) → render is enqueued. UI re-polls lookupVideo.
    return { videoUrl: null, state: "rendering" };
  } catch (e) {
    return {
      videoUrl: null,
      state: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
