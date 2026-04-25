/**
 * Google Places Autocomplete client.
 *
 * Note: this wrapper is safe to call from the browser because the Places
 * autocomplete endpoint is designed for client use and the public-safe alias
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is exposed to the bundle by Next.js.
 */

import type { ApiStatus } from "../contracts";
import { withTimeout, DEFAULT_TIMEOUT_MS } from "./timeout";

const ENDPOINT = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

export interface PlacesPrediction {
  description: string;
  placeId: string;
}

export interface PlacesAutocompleteResult {
  predictions: PlacesPrediction[];
  apiStatus: ApiStatus;
}

interface RawPrediction {
  description: string;
  place_id: string;
}

interface RawPlacesResponse {
  predictions?: RawPrediction[];
  status?: string;
  error_message?: string;
}

function getKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
  }
  return key;
}

function slugify(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function loadFixture(query: string): Promise<{
  predictions: PlacesPrediction[];
} | null> {
  const slug = slugify(query);
  // Try the slug first, then a generic fallback.
  const candidates = [slug, "reichstag", "brandenburg-gate"].filter(Boolean);

  for (const c of candidates) {
    try {
      const mod = await import(`../../data/fixtures/cached/places_${c}.json`);
      const data = (mod.default ?? mod) as { predictions?: PlacesPrediction[] };
      if (data && Array.isArray(data.predictions)) {
        return { predictions: data.predictions };
      }
    } catch {
      // fall through to next candidate
    }
  }
  return null;
}

async function fetchLive(query: string, signal: AbortSignal): Promise<PlacesPrediction[]> {
  const url =
    `${ENDPOINT}?input=${encodeURIComponent(query)}` +
    `&components=country:de&key=${encodeURIComponent(getKey())}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Places API HTTP ${res.status}`);
  }
  const json = (await res.json()) as RawPlacesResponse;
  if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`Places API status ${json.status}: ${json.error_message ?? ""}`);
  }
  return (json.predictions ?? []).map((p) => ({
    description: p.description,
    placeId: p.place_id,
  }));
}

export async function placesAutocomplete(
  query: string,
): Promise<PlacesAutocompleteResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      predictions: [],
      apiStatus: { source: "live", status: "ok", latencyMs: 0 },
    };
  }

  const controller = new AbortController();
  const fetchPromise = fetchLive(trimmed, controller.signal);

  const fallback = async (): Promise<PlacesPrediction[]> => {
    controller.abort();
    const cached = await loadFixture(trimmed);
    if (cached) return cached.predictions;
    return [];
  };

  const out = await withTimeout(fetchPromise, DEFAULT_TIMEOUT_MS, fallback);

  const apiStatus: ApiStatus = {
    source: out.source,
    status: out.status,
    latencyMs: out.latencyMs,
    message: out.message,
  };

  return { predictions: out.result, apiStatus };
}
