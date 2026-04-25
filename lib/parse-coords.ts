// Shared coordinate parser. Used by IntakePanel (client) + /quote page (server).
// Wraps the `coordinate-parser` npm package which handles decimal + DMS + many
// pasted formats. Returns null if the input isn't a valid coordinate — the
// caller falls back to address geocoding in that case.

import Coordinates from "coordinate-parser";

export interface ParsedCoords {
  lat: number;
  lng: number;
  /** Pretty-printed lat,lng for display in UI labels */
  formatted: string;
}

export function tryParseCoords(input: string): ParsedCoords | null {
  const trimmed = input.trim();
  if (trimmed.length < 4) return null;

  // The library's constructor throws on invalid strings — catch and return null.
  try {
    const c = new Coordinates(trimmed);
    const lat = c.getLatitude();
    const lng = c.getLongitude();
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return {
      lat,
      lng,
      formatted: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    };
  } catch {
    return null;
  }
}
