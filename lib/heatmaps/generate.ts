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
import { getDataLayers } from "@/lib/api/solar";

const RADIUS_METERS = 50;
const CACHE_DIR = join(tmpdir(), "verdict_heatmaps");
const MAX_EDGE_PX = 512;

function heatColor(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) {
    return [255, Math.round(c * 510), 0];
  }
  return [Math.round((1 - c) * 510), 255, 0];
}

function cachePathFor(lat: number, lng: number): string {
  const key = `${lat.toFixed(4)}_${lng.toFixed(4)}.png`;
  return join(CACHE_DIR, key);
}

function metaPathFor(lat: number, lng: number): string {
  const key = `${lat.toFixed(4)}_${lng.toFixed(4)}.json`;
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
  width?: number;
  height?: number;
  bounds?: { south: number; west: number; north: number; east: number };
}

export async function generateAnnualHeatmap(
  lat: number,
  lng: number,
): Promise<HeatmapResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const cachePath = cachePathFor(lat, lng);
  const metaPath = metaPathFor(lat, lng);
  if (await fileExists(cachePath)) {
    const meta = await readFile(metaPath, "utf-8")
      .then((text) => JSON.parse(text) as Omit<HeatmapResult, "bytes" | "contentType" | "source">)
      .catch(() => ({}));
    return {
      bytes: await readFile(cachePath),
      contentType: "image/png",
      source: "cached",
      ...meta,
    };
  }

  // 1. Fetch dataLayers JSON. This uses lib/api/solar.ts's in-memory cache,
  // so /api/data-layers and /api/heatmap dedupe quota-billed metadata calls.
  const { data } = await getDataLayers(lat, lng, RADIUS_METERS);
  const layers = data as { annualFluxUrl?: string } | null;
  if (!layers?.annualFluxUrl) return null;

  // 2. Download GeoTIFF (signed URL needs ?key= appended)
  const sep = layers.annualFluxUrl.includes("?") ? "&" : "?";
  const tiffRes = await fetch(`${layers.annualFluxUrl}${sep}key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!tiffRes.ok) return null;
  const buf = await tiffRes.arrayBuffer();

  // 3. Parse + colorize
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = typeof image.getBoundingBox === "function"
    ? (image.getBoundingBox() as number[])
    : null;
  const bounds =
    bbox && bbox.length >= 4 && bbox.every(Number.isFinite)
      ? { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] }
      : undefined;
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
    const [r, g, b] = heatColor(t);
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
  const meta = {
    fluxRange: { min, max },
    width: tw,
    height: th,
    bounds,
  };
  await writeFile(metaPath, JSON.stringify(meta));

  return {
    bytes: png,
    contentType: "image/png",
    source: "live",
    ...meta,
  };
}
