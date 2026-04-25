/**
 * Runtime heatmap generation. Same logic as scripts/bake-heatmaps.ts but
 * exposed as a function so /api/heatmap can call it on-demand for any address.
 *
 * Cached results land in /tmp/verdict_heatmaps/ so re-fetches are instant.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromArrayBuffer } from "geotiff";
import sharp from "sharp";

const DATA_LAYERS_ENDPOINT = "https://solar.googleapis.com/v1/dataLayers:get";
const RADIUS_METERS = 50;
const CACHE_DIR = join(tmpdir(), "verdict_heatmaps");
const MAX_EDGE_PX = 512;

const VIRIDIS: Array<[number, number, number]> = [
  [ 68,   1,  84], [ 72,  35, 116], [ 64,  67, 135], [ 52,  94, 141],
  [ 41, 120, 142], [ 32, 144, 140], [ 34, 167, 132], [ 68, 190, 112],
  [121, 209,  81], [189, 222,  38], [253, 231,  36],
];

function viridis(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  const s = c * (VIRIDIS.length - 1);
  const i = Math.floor(s);
  const f = s - i;
  if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1]!;
  const a = VIRIDIS[i]!;
  const b = VIRIDIS[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function cachePathFor(lat: number, lng: number): string {
  const key = `${lat.toFixed(4)}_${lng.toFixed(4)}.png`;
  return join(CACHE_DIR, key);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export interface HeatmapResult {
  bytes: Buffer;
  contentType: "image/png";
  source: "live" | "cached";
  fluxRange?: { min: number; max: number };
}

export async function generateAnnualHeatmap(
  lat: number,
  lng: number,
): Promise<HeatmapResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const cachePath = cachePathFor(lat, lng);
  if (await fileExists(cachePath)) {
    return {
      bytes: await readFile(cachePath),
      contentType: "image/png",
      source: "cached",
    };
  }

  // 1. Fetch dataLayers JSON
  const dlUrl =
    `${DATA_LAYERS_ENDPOINT}?location.latitude=${lat}` +
    `&location.longitude=${lng}` +
    `&radiusMeters=${RADIUS_METERS}` +
    `&view=FULL_LAYERS` +
    `&key=${encodeURIComponent(key)}`;

  const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(8000) });
  if (!dlRes.ok) return null;
  const data = (await dlRes.json()) as { annualFluxUrl?: string };
  if (!data.annualFluxUrl) return null;

  // 2. Download GeoTIFF (signed URL needs ?key= appended)
  const sep = data.annualFluxUrl.includes("?") ? "&" : "?";
  const tiffRes = await fetch(`${data.annualFluxUrl}${sep}key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!tiffRes.ok) return null;
  const buf = await tiffRes.arrayBuffer();

  // 3. Parse + colorize
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const band = (Array.isArray(rasters) ? rasters[0] : rasters) as
    | Float32Array | Int16Array | Uint8Array | Float64Array;

  // Find range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < band.length; i++) {
    const v = band[i] as number;
    if (!Number.isFinite(v) || v < -1) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    min = 0; max = 1500;
  }
  const range = max - min;

  // Build RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < band.length; i++) {
    const v = band[i] as number;
    const o = i * 4;
    if (!Number.isFinite(v) || v < -1) {
      rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 0;
      continue;
    }
    const t = (v - min) / range;
    const [r, g, b] = viridis(t);
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 230;
  }

  // 4. Resize + encode PNG
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(tw, th, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 80, effort: 10 })
    .toBuffer();

  // 5. Cache + return
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, png);

  return {
    bytes: png,
    contentType: "image/png",
    source: "live",
    fluxRange: { min, max },
  };
}
