/**
 * Lookup for pre-baked Solar annual-flux heatmap PNGs.
 *
 * Heatmaps are generated offline by `pnpm prebake:heatmaps` (see
 * scripts/bake-heatmaps.ts) and shipped in /public/heatmaps/. At runtime we
 * NEVER hit the Solar API or write to /public — Vercel's filesystem is
 * read-only and signed-URL GeoTIFF processing is too heavy/slow.
 *
 * The manifest is a static JSON committed alongside the PNGs; it is imported
 * at build time so this module is fully tree-shakable and works in both
 * server and client bundles.
 */

import manifest from "@/public/heatmaps/manifest.json";

interface ManifestEntry {
  label: string;
  lat: number;
  lng: number;
  latKey: string;
  lngKey: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  minFlux: number;
  maxFlux: number;
}

interface Manifest {
  generatedAt: string;
  radiusMeters: number;
  entries: ManifestEntry[];
  failures: Array<{ address: { label: string; lat: number; lng: number }; error: string }>;
}

const TYPED_MANIFEST = manifest as Manifest;

function round3(n: number): string {
  return n.toFixed(3);
}

function lookupKey(lat: number, lng: number): string {
  return `${round3(lat)}_${round3(lng)}`;
}

// Pre-index manifest by "lat3_lng3" for O(1) lookup.
const INDEX: Map<string, ManifestEntry> = new Map(
  TYPED_MANIFEST.entries.map((e) => [`${e.latKey}_${e.lngKey}`, e]),
);

/**
 * Returns the public path to a pre-baked heatmap PNG for the given coords,
 * or null if no heatmap was baked for this location.
 *
 * Lookup is rounded to 3 decimal places (~110 m) so coords coming from
 * Geocoding/Places will still resolve to the demo tile baked for that area.
 */
export function heatmapPath(lat: number, lng: number): string | null {
  const entry = INDEX.get(lookupKey(lat, lng));
  return entry ? entry.file : null;
}

/**
 * Full manifest entry for these coords (or null). Useful when the caller
 * needs the original flux range to render a value-aware legend.
 */
export function heatmapEntry(lat: number, lng: number): ManifestEntry | null {
  return INDEX.get(lookupKey(lat, lng)) ?? null;
}

/** All baked heatmap entries — handy for diagnostics / dev pages. */
export function allHeatmaps(): readonly ManifestEntry[] {
  return TYPED_MANIFEST.entries;
}
