/**
 * Google Solar API client (server-side only).
 *
 * Wraps `buildingInsights:findClosest` and `dataLayers:get` with the standard
 * Verdict resilience pattern: 4s timeout, cached fixture fallback, ApiStatus
 * always populated.
 *
 * Never call from the browser — uses the unrestricted server-only key.
 */

import type { ApiStatus } from "../contracts";
import { withTimeout, DEFAULT_TIMEOUT_MS } from "./timeout";

const BUILDING_INSIGHTS_ENDPOINT =
  "https://solar.googleapis.com/v1/buildingInsights:findClosest";
const DATA_LAYERS_ENDPOINT = "https://solar.googleapis.com/v1/dataLayers:get";

const DEFAULT_DATA_LAYERS_RADIUS_METERS = 50;

export interface SolarApiResult<T = unknown> {
  data: T;
  apiStatus: ApiStatus;
}

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set");
  }
  return key;
}

function latLngKey(lat: number, lng: number): string {
  // 4 decimals ≈ 11m precision — close enough for fixture lookup.
  return `${lat.toFixed(4)}_${lng.toFixed(4)}`;
}

async function loadFixture(api: "solar" | "datalayers", lat: number, lng: number) {
  // Only return a fixture that matches the SPECIFIC lat/lng. Read with fs so
  // Turbopack doesn't choke on a template-literal dynamic import.
  const key = latLngKey(lat, lng);
  const fileName = `${api}_${key}.json`;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), "data", "fixtures", "cached", fileName);
    const text = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data && typeof data === "object") return data;
  } catch {
    // No fixture for this exact location — caller will surface "no coverage".
  }
  return null;
}

/**
 * Marker error class that signals "Solar API has no building data at these
 * coordinates" — distinct from network/auth/quota failures. The caller uses
 * this to decide whether to render "no coverage here" vs "try again later".
 */
export class NoSolarCoverageError extends Error {
  constructor(message = "No Solar API coverage at these coordinates") {
    super(message);
    this.name = "NoSolarCoverageError";
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Solar API returns 404 + "Requested entity was not found" when the address
    // is outside coverage. Distinguish that from real errors (auth, quota, 5xx).
    if (res.status === 404) {
      throw new NoSolarCoverageError();
    }
    throw new Error(`Solar API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function getBuildingInsights(
  lat: number,
  lng: number,
): Promise<SolarApiResult> {
  const url =
    `${BUILDING_INSIGHTS_ENDPOINT}?location.latitude=${lat}` +
    `&location.longitude=${lng}` +
    `&key=${encodeURIComponent(getKey())}`;

  const controller = new AbortController();
  const live = fetchJson(url, controller.signal);

  const fallback = async (): Promise<unknown> => {
    controller.abort();
    const cached = await loadFixture("solar", lat, lng);
    return cached ?? null;
  };

  let noCoverage = false;
  let fetchError: string | undefined;
  const safeLive = live.catch((e) => {
    if (e instanceof NoSolarCoverageError) {
      noCoverage = true;
      return null;
    }
    fetchError = e instanceof Error ? e.message : String(e);
    return null;
  });

  const out = await withTimeout(safeLive, DEFAULT_TIMEOUT_MS, fallback);

  // Decide a HONEST status. Three possible outcomes:
  //   - Live data returned (out.result truthy, no error flagged)  → live + ok
  //   - 404/no-coverage from Solar API                            → mock + ok + clear msg
  //   - Other error (auth, quota, 5xx, network, timeout)          → cached/mock + error
  let source: ApiStatus["source"] = out.source;
  let status: ApiStatus["status"] = out.status;
  let message: string | undefined = out.message;

  if (noCoverage) {
    source = "mock";
    status = "ok";
    message = "Google Solar API has no building data at these coordinates";
  } else if (fetchError && !out.result) {
    source = out.source === "live" ? "mock" : out.source;
    status = "error";
    message = fetchError;
  }

  return {
    data: out.result,
    apiStatus: { source, status, latencyMs: out.latencyMs, message },
  };
}

export async function getDataLayers(
  lat: number,
  lng: number,
  radiusMeters: number = DEFAULT_DATA_LAYERS_RADIUS_METERS,
): Promise<SolarApiResult> {
  const url =
    `${DATA_LAYERS_ENDPOINT}?location.latitude=${lat}` +
    `&location.longitude=${lng}` +
    `&radiusMeters=${radiusMeters}` +
    `&view=FULL_LAYERS` +
    `&key=${encodeURIComponent(getKey())}`;

  const controller = new AbortController();
  const live = fetchJson(url, controller.signal);

  const fallback = async (): Promise<unknown> => {
    controller.abort();
    const cached = await loadFixture("datalayers", lat, lng);
    return cached ?? null;
  };

  const out = await withTimeout(live, DEFAULT_TIMEOUT_MS, fallback);

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
