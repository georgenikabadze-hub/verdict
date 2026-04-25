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
  const key = latLngKey(lat, lng);
  // Try the precise key, then named landmark fallbacks shipped with the repo.
  const candidates = [key, "brandenburg-gate", "reichstag"];

  for (const c of candidates) {
    try {
      const mod = await import(`../../data/fixtures/cached/${api}_${c}.json`);
      const data = (mod.default ?? mod) as Record<string, unknown>;
      if (data && typeof data === "object") return data;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
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
    if (cached) return cached;
    throw new Error("No cached Solar buildingInsights fixture available");
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
    if (cached) return cached;
    throw new Error("No cached Solar dataLayers fixture available");
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
