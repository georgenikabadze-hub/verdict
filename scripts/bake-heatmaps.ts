/**
 * Pre-bake Solar API annual-flux heatmaps as PNGs for the demo address set.
 *
 * Why this exists:
 *   The Solar API `dataLayers:get` endpoint returns SIGNED GeoTIFF URLs that
 *   expire 1 hour after issue. Processing GeoTIFFs at runtime on Vercel is
 *   not viable (signed URLs may expire, /public is read-only, GeoTIFF parsing
 *   pulls heavy deps). So we bake everything offline, ship the PNGs in /public,
 *   and the runtime client just reads the static asset.
 *
 * Run via:
 *   GOOGLE_MAPS_API_KEY=... pnpm prebake:heatmaps
 *
 * Output:
 *   public/heatmaps/annual_<lat3>_<lng3>.png  (one per demo address)
 *   public/heatmaps/manifest.json             (lookup index for the client)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromArrayBuffer } from "geotiff";
import sharp from "sharp";

interface DemoAddress {
  label: string;
  lat: number;
  lng: number;
}

const DEMO_ADDRESSES: DemoAddress[] = [
  { label: "Reichstag, Berlin",        lat: 52.516274, lng: 13.377704 },
  { label: "Brandenburg Gate, Berlin", lat: 52.516275, lng: 13.377700 }, // adjacent — same Solar tile
  { label: "Im Winkel 37, Berlin",     lat: 52.4180,   lng: 13.1640   },
  { label: "Hamburg city centre",      lat: 53.5511,   lng: 9.9937    },
  { label: "Munich Marienplatz",       lat: 48.1374,   lng: 11.5755   },
  { label: "Ruhr (Ruhr.glb match)",    lat: 51.145507, lng: 7.109045  },
];

const DATA_LAYERS_ENDPOINT = "https://solar.googleapis.com/v1/dataLayers:get";
const RADIUS_METERS = 50;
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(PROJECT_ROOT, "public", "heatmaps");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");

// ---------------------------------------------------------------------------
// Viridis colormap — matplotlib's perceptually-uniform default. 9 anchor stops
// linearly interpolated. Low = dark purple, mid = teal, high = yellow.
// ---------------------------------------------------------------------------
const VIRIDIS: Array<[number, number, number]> = [
  [ 68,   1,  84],
  [ 72,  35, 116],
  [ 64,  67, 135],
  [ 52,  94, 141],
  [ 41, 120, 142],
  [ 32, 144, 140],
  [ 34, 167, 132],
  [ 68, 190, 112],
  [121, 209,  81],
  [189, 222,  38],
  [253, 231,  36],
];

function viridis(t: number): [number, number, number] {
  // t in [0, 1]
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (VIRIDIS.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1]!;
  const a = VIRIDIS[i]!;
  const b = VIRIDIS[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function round3(n: number): string {
  // Stable string with exactly 3 decimals: "52.516" / "13.378"
  return n.toFixed(3);
}

function pngFileName(lat: number, lng: number): string {
  return `annual_${round3(lat)}_${round3(lng)}.png`;
}

async function fetchDataLayers(lat: number, lng: number, key: string) {
  const url =
    `${DATA_LAYERS_ENDPOINT}?location.latitude=${lat}` +
    `&location.longitude=${lng}` +
    `&radiusMeters=${RADIUS_METERS}` +
    `&view=FULL_LAYERS` +
    `&key=${encodeURIComponent(key)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`dataLayers HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { annualFluxUrl?: string };
}

async function downloadGeoTiff(signedUrl: string, key: string): Promise<ArrayBuffer> {
  // Solar API GeoTIFFs require ?key=<API_KEY> appended to the signed URL.
  const sep = signedUrl.includes("?") ? "&" : "?";
  const fullUrl = `${signedUrl}${sep}key=${encodeURIComponent(key)}`;
  const res = await fetch(fullUrl);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GeoTIFF fetch HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.arrayBuffer();
}

async function colorizeAnnualFlux(
  buf: ArrayBuffer,
  outPath: string,
): Promise<{ width: number; height: number; bytes: number; min: number; max: number }> {
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();

  // annualFlux is a single-band float32 raster (kWh/kW/year — typical 0–2000 in DE).
  // readRasters() returns either a typed-array or an array of typed-arrays.
  const band = (Array.isArray(rasters) ? rasters[0] : rasters) as
    | Float32Array
    | Int16Array
    | Uint8Array
    | Float64Array;

  // Treat sentinel values (-9999, NaN, very large negatives) as "no data".
  const NO_DATA_THRESHOLD = -1; // anything < -1 is sentinel/nodata

  // Find the dynamic range across valid pixels for normalization.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < band.length; i += 1) {
    const v = band[i] as number;
    if (!Number.isFinite(v) || v < NO_DATA_THRESHOLD) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    // Fall back to a sensible Germany-wide range so we still emit *something*
    // perceptible rather than a flat image.
    min = 0;
    max = 1500;
  }

  const range = max - min;
  // RGBA buffer, transparent for nodata so the heatmap blends over satellite.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < band.length; i += 1) {
    const v = band[i] as number;
    const o = i * 4;
    if (!Number.isFinite(v) || v < NO_DATA_THRESHOLD) {
      // transparent pixel
      rgba[o]     = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 0;
      continue;
    }
    const t = (v - min) / range;
    const [r, g, b] = viridis(t);
    rgba[o]     = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 230; // ~90% — so the LayerSwitcher can blend further at 70%
  }

  // Downscale to ~512px max edge before encoding. The native raster is
  // ~1000x1000 (~10 cm/pixel) which is overkill for a UI overlay and pushes
  // PNGs to ~700KB. 512px keeps street-level detail at a fraction of the size.
  const MAX_EDGE = 512;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(targetW, targetH, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 80, effort: 10 })
    .toFile(outPath);

  const { size } = await import("node:fs/promises").then((m) => m.stat(outPath));
  return { width, height, bytes: size, min, max };
}

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

async function main(): Promise<void> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.error("GOOGLE_MAPS_API_KEY is required.");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const manifest: ManifestEntry[] = [];
  const failures: Array<{ address: DemoAddress; error: string }> = [];

  for (const addr of DEMO_ADDRESSES) {
    const fileName = pngFileName(addr.lat, addr.lng);
    const outPath = join(OUT_DIR, fileName);
    const tag = `[${addr.label} @ ${addr.lat},${addr.lng}]`;

    try {
      console.log(`${tag} fetching dataLayers…`);
      const layers = await fetchDataLayers(addr.lat, addr.lng, key);
      if (!layers.annualFluxUrl) {
        throw new Error("dataLayers response missing annualFluxUrl");
      }

      console.log(`${tag} downloading GeoTIFF…`);
      const buf = await downloadGeoTiff(layers.annualFluxUrl, key);

      console.log(`${tag} colorizing → ${fileName}`);
      const meta = await colorizeAnnualFlux(buf, outPath);

      console.log(
        `${tag} OK ${meta.width}x${meta.height} · ${(meta.bytes / 1024).toFixed(1)}KB · flux ${meta.min.toFixed(0)}…${meta.max.toFixed(0)}`,
      );

      manifest.push({
        label: addr.label,
        lat: addr.lat,
        lng: addr.lng,
        latKey: round3(addr.lat),
        lngKey: round3(addr.lng),
        file: `/heatmaps/${fileName}`,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        minFlux: meta.min,
        maxFlux: meta.max,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} FAILED: ${msg}`);
      failures.push({ address: addr, error: msg });
    }
  }

  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        radiusMeters: RADIUS_METERS,
        entries: manifest,
        failures,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `\nDone. ${manifest.length}/${DEMO_ADDRESSES.length} heatmaps baked. Manifest → ${MANIFEST_PATH}`,
  );
  if (failures.length > 0) {
    console.log(
      `${failures.length} failure(s); manifest still written so build won't break.`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
