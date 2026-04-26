"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CESIUM_BASE_URL, tilesetUrl } from "@/lib/cesium/config";
import { RoofMap3D } from "./RoofMap3D";

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
  /** Bubble the Cesium Viewer up to the parent (installer overlays etc.).
   *  Called with the instance once mounted, and with `null` on teardown. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onViewerReady?: (viewer: any | null) => void;
}

type Status = "loading" | "ready" | "error";

// CesiumJS expects `window.CESIUM_BASE_URL` to be set BEFORE its module code
// runs, otherwise Workers/Assets/Widgets resolve to wrong paths. We set it on
// the window the moment this client-only file evaluates, then dynamically
// import cesium on mount so the heavy bundle isn't pulled at module-eval time
// of a server tree-shake pass.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).CESIUM_BASE_URL = CESIUM_BASE_URL;
}

// Default buffer around the OSM footprint when the selection is confident.
// A 15 m tree at low Berlin winter-sun elevation (~15°) casts a ~55 m shadow,
// so solar realism needs nearby vegetation visible. Keeping trees within
// ~20 m preserves shade context even though the previous 7 m buffer better
// matched a GLB-extracted house aesthetic.
const CLIP_BUFFER_METERS = 20;

// When the OSM-pick confidence is low (the chosen polygon barely beat the
// runner-up, or the geocoded point sits between two adjacent buildings) we
// widen further so the view does not lose vegetation that can cast meaningful
// shade. The earlier 10 m value kept a tighter isolated-house look, but solar
// context wins over the extracted-GLB aesthetic.
const LOW_CONFIDENCE_BUFFER_METERS = 30;
const CIRCLE_FALLBACK_RADIUS_M = 25;
const CIRCLE_FALLBACK_SIDES = 24;

// WGS84 height=0 sits well below the actual ground in most populated places —
// Berlin is ~35 m above the ellipsoid, the Ruhr ~50 m, the Alps anywhere
// from 400 m up. We sample the real ground height off the Photoreal tileset
// after it loads (`scene.sampleHeightMostDetailed`); this constant is only
// used as a first-paint fallback before the sample resolves.
const DEFAULT_GROUND_HEIGHT_M = 38;
const CAMERA_NEAR_PLANE_M = 0.1;
const MINIMUM_ZOOM_DISTANCE_M = 10;

/**
 * Ray-pick the ground height at (lng, lat) against whatever's in the scene
 * (i.e. the Photoreal 3D Tileset). Returns DEFAULT_GROUND_HEIGHT_M when the
 * sample isn't available yet — typical when the tileset's local LOD hasn't
 * streamed in near the target. Caller should re-sample after a beat in that
 * case.
 *
 * Why we need this: lookAtTransform places the camera relative to a Cartesian3
 * target. If the target is at WGS84 height 0 and the actual ground is +38 m
 * (Berlin) or higher, every preset that isn't straight-down ends up putting
 * the camera at or below ground level — the building disappears into the
 * mesh, which is how Falkenried 9 was rendering before this fix.
 */
async function sampleGroundHeight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewer: any,
  lng: number,
  lat: number,
): Promise<number> {
  try {
    if (typeof viewer?.scene?.sampleHeightMostDetailed !== "function") {
      // eslint-disable-next-line no-console
      console.warn("[ground] sampleHeightMostDetailed missing");
      return DEFAULT_GROUND_HEIGHT_M;
    }
    const positions = [Cesium.Cartographic.fromDegrees(lng, lat)];
    const sampled = await viewer.scene.sampleHeightMostDetailed(positions);
    const h = sampled?.[0]?.height;
    // eslint-disable-next-line no-console
    console.log(`[ground] sample at ${lat},${lng} →`, h);
    if (Number.isFinite(h)) return h;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ground] sample threw", err);
  }
  return DEFAULT_GROUND_HEIGHT_M;
}

interface BoundingBox {
  sw: { latitude: number; longitude: number };
  ne: { latitude: number; longitude: number };
}

interface RoofSegmentLite {
  pitchDegrees?: number;
  azimuthDegrees?: number;
  areaMeters2?: number;
  annualSunshineHours?: number;
}

interface RoofFactsResponse {
  boundingBox?: BoundingBox;
  segments?: RoofSegmentLite[];
  totalAreaM2?: number;
}

interface OsmLatLng {
  lat: number;
  lng: number;
}

interface FootprintResponse {
  footprint: {
    polygon: OsmLatLng[];
    centroid: OsmLatLng;
    areaM2: number;
    lengthM: number;
    widthM: number;
    source: "contains" | "scored" | "fallback";
    confidence: "high" | "low";
  } | null;
}

export interface RoofDimensions {
  /** Approx footprint length (longest side of axis-aligned bbox). */
  lengthM: number;
  widthM: number;
  footprintAreaM2: number;
  totalRoofAreaM2?: number;
  roofPitchDeg?: number;
  source: "osm" | "solar-bbox" | "circle";
  target?: OsmLatLng;
}

/**
 * Force the polygon into counter-clockwise winding in local projected metres.
 *
 * Cesium 1.140 computes polygon clipping with a ray-crossing signed-distance
 * texture, so winding is not what decides the keep/discard side there. We
 * still canonicalise the ring before buffering because OSM ways arrive in
 * either direction and a projected signed area is the least surprising source
 * of truth for future geometry work.
 */
function ensureCCW(poly: OsmLatLng[]): OsmLatLng[] {
  if (poly.length < 3) return poly;
  const cLat = poly.reduce((a, p) => a + p.lat, 0) / poly.length;
  const cLng = poly.reduce((a, p) => a + p.lng, 0) / poly.length;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  let signedArea2 = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = (poly[i].lng - cLng) * 111_320 * cosLat;
    const yi = (poly[i].lat - cLat) * 111_320;
    const xj = (poly[j].lng - cLng) * 111_320 * cosLat;
    const yj = (poly[j].lat - cLat) * 111_320;
    signedArea2 += xj * yi - xi * yj;
  }
  return signedArea2 < 0 ? [...poly].reverse() : poly;
}

/**
 * Push every polygon vertex outward from the centroid by `meters`. Crude
 * (a real Minkowski sum would be edge-aware), but for a small uniform buffer
 * around a single building it's visually indistinguishable.
 */
function expandPolygon(poly: OsmLatLng[], meters: number): OsmLatLng[] {
  if (poly.length === 0) return poly;
  const cLat = poly.reduce((a, p) => a + p.lat, 0) / poly.length;
  const cLng = poly.reduce((a, p) => a + p.lng, 0) / poly.length;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  return poly.map((p) => {
    const dLatM = (p.lat - cLat) * 111_320;
    const dLngM = (p.lng - cLng) * 111_320 * cosLat;
    const distM = Math.hypot(dLatM, dLngM);
    if (distM < 0.05) return p;
    const factor = (distM + meters) / distM;
    return {
      lat: cLat + (p.lat - cLat) * factor,
      lng: cLng + (p.lng - cLng) * factor,
    };
  });
}

function isUsableFootprint(
  footprint: FootprintResponse["footprint"],
): footprint is NonNullable<FootprintResponse["footprint"]> {
  if (!footprint || footprint.polygon.length < 3) return false;
  return (
    Number.isFinite(footprint.areaM2) &&
    footprint.areaM2 > 1 &&
    Number.isFinite(footprint.lengthM) &&
    footprint.lengthM > 0 &&
    Number.isFinite(footprint.widthM) &&
    footprint.widthM > 0 &&
    footprint.polygon.every(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    )
  );
}

function createCirclePolygon(
  center: OsmLatLng,
  radiusM: number,
  sides = CIRCLE_FALLBACK_SIDES,
): OsmLatLng[] {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    const dLngM = Math.cos(angle) * radiusM;
    const dLatM = Math.sin(angle) * radiusM;
    return {
      lat: center.lat + dLatM / 111_320,
      lng: center.lng + dLngM / (111_320 * cosLat),
    };
  });
}

function pointInPolygon(pt: OsmLatLng, poly: OsmLatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng;
    const yi = poly[i].lat;
    const xj = poly[j].lng;
    const yj = poly[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygonM(pt: OsmLatLng, poly: OsmLatLng[]): number {
  if (poly.length < 3) return Infinity;
  if (pointInPolygon(pt, poly)) return 0;
  const cosLat = Math.cos((pt.lat * Math.PI) / 180);
  const px = pt.lng * 111_320 * cosLat;
  const py = pt.lat * 111_320;
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].lng * 111_320 * cosLat;
    const ay = poly[j].lat * 111_320;
    const bx = poly[i].lng * 111_320 * cosLat;
    const by = poly[i].lat * 111_320;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    min = Math.min(min, Math.hypot(px - cx, py - cy));
  }
  return min;
}

function createBufferedBoundingBoxPolygon(
  boundingBox: BoundingBox,
  bufferM: number,
): {
  center: OsmLatLng;
  polygon: OsmLatLng[];
  lengthM: number;
  widthM: number;
  areaM2: number;
} | null {
  const south = Math.min(boundingBox.sw.latitude, boundingBox.ne.latitude);
  const north = Math.max(boundingBox.sw.latitude, boundingBox.ne.latitude);
  const west = Math.min(boundingBox.sw.longitude, boundingBox.ne.longitude);
  const east = Math.max(boundingBox.sw.longitude, boundingBox.ne.longitude);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;

  const center = {
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  };
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  if (!Number.isFinite(cosLat) || Math.abs(cosLat) < 0.0001) return null;

  const heightM = (north - south) * 111_320;
  const widthM = (east - west) * 111_320 * cosLat;
  if (heightM <= 0 || widthM <= 0) return null;

  const latBuffer = bufferM / 111_320;
  const lngBuffer = bufferM / (111_320 * cosLat);
  const bufferedSouth = south - latBuffer;
  const bufferedNorth = north + latBuffer;
  const bufferedWest = west - lngBuffer;
  const bufferedEast = east + lngBuffer;

  return {
    center,
    polygon: [
      { lat: bufferedSouth, lng: bufferedWest },
      { lat: bufferedSouth, lng: bufferedEast },
      { lat: bufferedNorth, lng: bufferedEast },
      { lat: bufferedNorth, lng: bufferedWest },
    ],
    lengthM: Math.max(widthM, heightM),
    widthM: Math.min(widthM, heightM),
    areaM2: widthM * heightM,
  };
}

function applyClipPolygon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileset: any,
  polygonPoints: OsmLatLng[],
): void {
  const flat: number[] = [];
  for (const p of polygonPoints) {
    flat.push(p.lng, p.lat);
  }
  const positions = Cesium.Cartesian3.fromDegreesArray(flat);
  const polygon = new Cesium.ClippingPolygon({ positions });
  tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
    polygons: [polygon],
    // Cesium's signed-distance shader treats the polygon interior as the
    // negative side. `inverse: true` discards everything outside the polygon.
    inverse: true,
  });
}

/**
 * Fetch the building footprint (OSM Overpass, server-proxied) and apply a
 * ClippingPolygonCollection that keeps only what's inside it. If OSM has no
 * usable nearby building, Solar's findClosest bounding box snaps the camera
 * and clip to the building Google found. If both sources miss, we fall back
 * to a tight circle around the geocode.
 *
 * Why two sources: OSM is the authoritative cadastral outline so the clip
 * matches the real building shape. Solar's bbox is looser, but it is still a
 * better target than a road-centered geocode when OSM has no polygon.
 *
 * Returns the dimensions extracted from the chosen source so the parent can
 * render an overlay without re-fetching.
 */
async function applyBuildingClip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileset: any,
  coords: { lat: number; lng: number },
): Promise<RoofDimensions | null> {
  // Fetch both sources in parallel. OSM gives polygon + length/width; Solar
  // gives roof area and per-segment pitch.
  const [footprintRes, factsRes] = await Promise.allSettled([
    fetch(`/api/footprint?lat=${coords.lat}&lng=${coords.lng}`, {
      cache: "no-store",
    }),
    fetch(`/api/roof-facts?lat=${coords.lat}&lng=${coords.lng}`, {
      cache: "no-store",
    }),
  ]);

  let osmFootprint: FootprintResponse["footprint"] | null = null;
  if (footprintRes.status === "fulfilled" && footprintRes.value.ok) {
    try {
      const data = (await footprintRes.value.json()) as FootprintResponse;
      osmFootprint = data.footprint;
    } catch {
      osmFootprint = null;
    }
  }

  let roofFacts: RoofFactsResponse | null = null;
  if (factsRes.status === "fulfilled" && factsRes.value.ok) {
    try {
      roofFacts = (await factsRes.value.json()) as RoofFactsResponse;
    } catch {
      roofFacts = null;
    }
  }

  // Roof pitch: median of segment pitches when we have several, else first.
  const pitches = (roofFacts?.segments ?? [])
    .map((s) => s.pitchDegrees)
    .filter((p): p is number => Number.isFinite(p));
  const roofPitchDeg =
    pitches.length === 0
      ? undefined
      : pitches.length === 1
        ? pitches[0]
        : [...pitches].sort((a, b) => a - b)[Math.floor(pitches.length / 2)];

  // ---- Sanity-check OSM polygon against Solar API bbox ----
  // The AI per-panel placement (solarPanels[] in roofFacts) lives inside the
  // Solar API bbox. If OSM picked a DIFFERENT nearby building (common in
  // dense urban blocks where Overpass returns several candidates and the
  // server picks by nearest-centroid), the clip mask will show that other
  // building while the panels float over the actual one — clearly broken.
  // When the two disagree by more than 25 m we discard the OSM polygon and
  // fall through to the Solar bbox path below.
  if (isUsableFootprint(osmFootprint) && roofFacts?.boundingBox) {
    const sw = roofFacts.boundingBox.sw;
    const ne = roofFacts.boundingBox.ne;
    const bboxCenterLat = (sw.latitude + ne.latitude) / 2;
    const bboxCenterLng = (sw.longitude + ne.longitude) / 2;
    let osmSumLat = 0;
    let osmSumLng = 0;
    for (const p of osmFootprint.polygon) {
      osmSumLat += p.lat;
      osmSumLng += p.lng;
    }
    const osmCenterLat = osmSumLat / osmFootprint.polygon.length;
    const osmCenterLng = osmSumLng / osmFootprint.polygon.length;
    const dLatM = (osmCenterLat - bboxCenterLat) * 111_320;
    const cosLat = Math.cos((bboxCenterLat * Math.PI) / 180);
    const dLngM = (osmCenterLng - bboxCenterLng) * 111_320 * cosLat;
    const offsetMeters = Math.sqrt(dLatM * dLatM + dLngM * dLngM);
    const bboxCenterDistanceM = distanceToPolygonM(
      { lat: bboxCenterLat, lng: bboxCenterLng },
      osmFootprint.polygon,
    );
    if (offsetMeters > 25 || bboxCenterDistanceM > 8) {
      // OSM and Solar disagree on which building this is — trust Solar
      // because that's where the panels will appear.
      osmFootprint = null;
    }
  }

  // ---- Pick the clip source: OSM polygon, Solar bbox, else geocode circle ----
  if (isUsableFootprint(osmFootprint)) {
    const buffer =
      osmFootprint.confidence === "low"
        ? LOW_CONFIDENCE_BUFFER_METERS
        : CLIP_BUFFER_METERS;
    const ccw = ensureCCW(osmFootprint.polygon);
    const expanded = expandPolygon(ccw, buffer);
    try {
      applyClipPolygon(Cesium, tileset, expanded);
      return {
        lengthM: osmFootprint.lengthM,
        widthM: osmFootprint.widthM,
        footprintAreaM2: osmFootprint.areaM2,
        totalRoofAreaM2: roofFacts?.totalAreaM2,
        roofPitchDeg,
        source: "osm",
        target: osmFootprint.centroid,
      };
    } catch {
      // ClippingPolygon construction can throw on degenerate / self-
      // intersecting OSM data; fall through to the Solar bbox snap.
    }
  }

  // Bump the Solar bbox buffer from 5 m → 12 m so the clip mask comfortably
  // includes every panel position even when the bbox is tight on the roof.
  // Without this the outermost AI panels can fall just outside the mask and
  // disappear into the black void.
  const solarBox = roofFacts?.boundingBox
    ? createBufferedBoundingBoxPolygon(roofFacts.boundingBox, 12)
    : null;
  if (solarBox) {
    try {
      applyClipPolygon(Cesium, tileset, solarBox.polygon);
      return {
        lengthM: solarBox.lengthM,
        widthM: solarBox.widthM,
        footprintAreaM2: solarBox.areaM2,
        totalRoofAreaM2: roofFacts?.totalAreaM2,
        roofPitchDeg,
        source: "solar-bbox",
        target: solarBox.center,
      };
    } catch {
      // If Cesium rejects the rectangle, keep the existing last-resort
      // geocode-centered fallback instead of failing the whole scene.
    }
  }

  try {
    applyClipPolygon(
      Cesium,
      tileset,
      createCirclePolygon(coords, CIRCLE_FALLBACK_RADIUS_M),
    );
  } catch {
    return null;
  }

  return {
    lengthM: CIRCLE_FALLBACK_RADIUS_M * 2,
    widthM: CIRCLE_FALLBACK_RADIUS_M * 2,
    footprintAreaM2: Math.PI * CIRCLE_FALLBACK_RADIUS_M ** 2,
    totalRoofAreaM2: roofFacts?.totalAreaM2,
    roofPitchDeg,
    source: "circle",
  };
}

interface CameraPreset {
  id: string;
  label: string;
  /** degrees */
  heading: number;
  /** degrees, negative looks down */
  pitch: number;
  /** metres from target */
  range: number;
}

// Preset framings. Headings assume north = 0 (standard Cesium convention).
// "Front" is south-facing because solar-relevant facades in the northern
// hemisphere are the south ones — that's what the user actually cares about.
// Camera presets the installer can flip between with the toolbar pills.
// `roof` lands the user looking down at the roof from a steep angle — best
// default for inspection and panel-edit work. The previous "oblique" default
// at pitch -45 was too horizontal: tall buildings blocked the view and you
// often saw trees instead of the roof.
const CAMERA_PRESETS: CameraPreset[] = [
  { id: "top",      label: "Top",        heading: 0,   pitch: -90, range: 110 },
  { id: "roof",     label: "Roof angle", heading: 0,   pitch: -70, range: 95 },
  { id: "oblique",  label: "Oblique",    heading: 45,  pitch: -50, range: 110 },
  { id: "front",    label: "Front",      heading: 180, pitch: -25, range: 100 },
  { id: "side",     label: "Side",       heading: 90,  pitch: -25, range: 100 },
];

const DEFAULT_PRESET = CAMERA_PRESETS[1]; // "roof" — steep angle, always shows the roof clearly

export default function CesiumRoofViewInner({ coords, address, onViewerReady }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // We hold the viewer in a ref so React's strict-mode double-invoke doesn't
  // create two viewers fighting over the same canvas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // Cached lookAtTransform target (ECEF Cartesian3) + Cesium namespace so
  // preset buttons can re-aim the camera without re-importing cesium each
  // click. Both populated on viewer mount and refreshed on coords change.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cesiumRef = useRef<any>(null);
  // The wheel-zoom listener we install on the canvas so we can detach it
  // on unmount / viewer change without leaking listeners on the canvas
  // (which Cesium itself can outlive in dev hot-reload scenarios).
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [dimensions, setDimensions] = useState<RoofDimensions | null>(null);
  const [activePreset, setActivePreset] = useState<string>(DEFAULT_PRESET.id);
  // Dimensions panel is a disclosure — open by default so the numbers are
  // discoverable on first paint, but users can collapse it to a single-line
  // pill when they want the 3D mesh to breathe.
  const [dimsOpen, setDimsOpen] = useState(true);

  // -------------------------------------------------------------------------
  // Mount the viewer once, then re-fly to new coords on every coords change.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!apiKey) {
      setStatus("error");
      return;
    }
    if (!containerRef.current) return;
    if (viewerRef.current) return; // already mounted

    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Cesium: any = await import("cesium");
        cesiumRef.current = Cesium;

        // Inject Cesium widgets CSS once — served from /public/cesium/Widgets/
        // by the postinstall hook. Importing the .css file from node_modules
        // doesn't have a type declaration in Next 15 + TS strict.
        if (typeof document !== "undefined" && !document.getElementById("cesium-widgets-css")) {
          const link = document.createElement("link");
          link.id = "cesium-widgets-css";
          link.rel = "stylesheet";
          link.href = `${CESIUM_BASE_URL}/Widgets/widgets.css`;
          document.head.appendChild(link);
        }

        if (cancelled || !containerRef.current) return;

        // Photorealistic 3D Tiles are served directly from tile.googleapis.com,
        // so no Cesium Ion token is required. We blank it explicitly to avoid
        // CesiumJS attempting an Ion auth round-trip for default assets.
        if (Cesium.Ion) Cesium.Ion.defaultAccessToken = "";

        // Create the viewer. Disable everything we don't want — we only render
        // the photoreal mesh, no blue marble, no widgets, no timeline.
        const viewer = new Cesium.Viewer(containerRef.current, {
          // No default imagery — Photorealistic 3D Tiles already ship colored
          // meshes; layering Bing/ESRI imagery underneath would just waste GPU.
          baseLayerPicker: false,
          imageryProvider: false,
          // Typical chrome we don't need in a hero pane.
          animation: false,
          timeline: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          // Cesium MUST display attribution for Google Photoreal 3D Tiles.
          // This is a hard license requirement — do not flip to false.
          showCreditsOnScreen: true,
          // Use the WebGL2 context when available for better perf on the mesh.
          contextOptions: {
            webgl: { powerPreference: "high-performance" },
          },
        });
        viewerRef.current = viewer;
        // Hand the viewer up to the parent so installer-side overlays (panel
        // polygons, etc.) can attach entities. Safe to fire as soon as the
        // viewer exists — overlays handle being added before the tileset is
        // fully streamed.
        onViewerReady?.(viewer);

        // Hide the blue WGS84 globe — only the photoreal tileset should render.
        viewer.scene.globe.show = false;
        viewer.scene.camera.frustum.near = CAMERA_NEAR_PLANE_M;
        if ("logarithmicDepthBuffer" in viewer.scene) {
          viewer.scene.logarithmicDepthBuffer = true;
        }
        // Pure black so the clipped building reads as an isolated GLB-style
        // object. The dark-but-tinted Verdict bg leaks colour around the mesh
        // edges — the GLB references the user loves are all on true black.
        viewer.scene.backgroundColor = Cesium.Color.BLACK;
        // The default sky gradient looks blue/cloudy; kill everything that
        // implies "outdoors" so the scene reads as a studio extraction.
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        if (viewer.scene.fog) viewer.scene.fog.enabled = false;
        if (viewer.scene.globe) viewer.scene.globe.showGroundAtmosphere = false;
        // Single warm directional "studio" light. Cesium's default SunLight
        // tracks real time-of-day; we want a fixed, flattering angle so the
        // mesh always reads the same way regardless of when the demo runs.
        try {
          viewer.scene.light = new Cesium.DirectionalLight({
            direction: Cesium.Cartesian3.normalize(
              new Cesium.Cartesian3(0.35, 0.35, -0.87),
              new Cesium.Cartesian3(),
            ),
            color: Cesium.Color.fromCssColorString("#FFE2B6"),
            intensity: 2.0,
          });
        } catch {
          // Older Cesium minor versions: fallthrough to default SunLight.
        }

        // Per Google docs the root tileset URL has a ~3 hour session TTL.
        // We re-request root.json on every viewer mount, which is exactly what
        // `Cesium3DTileset.fromUrl` does under the hood.
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          tilesetUrl(apiKey),
          {
            // Photorealistic 3D Tiles ship as glTF; let Cesium pick the best
            // screen-space-error budget automatically.
            showCreditsOnScreen: true,
          },
        );

        if (cancelled) {
          tileset.destroy?.();
          return;
        }

        viewer.scene.primitives.add(tileset);

        // -----------------------------------------------------------------
        // Building isolation via ClippingPolygonCollection (CesiumJS ≥1.116).
        //
        // We fetch the building footprint from OSM and expand it by a tight
        // buffer so eaves and minor geocode error survive. With
        // `inverse: true` the collection clips OUTSIDE the polygon, leaving
        // only the home visible against the dark scene background. If OSM
        // cannot identify a usable single building, Solar's bbox snaps the
        // camera and clip to the nearest building before the circle fallback.
        //
        // Cesium API references:
        //   https://cesium.com/learn/cesiumjs/ref-doc/ClippingPolygonCollection.html
        //   https://cesium.com/learn/cesiumjs/ref-doc/ClippingPolygon.html
        //
        // No modelMatrix juggling required — polygon vertices live in world
        // ECEF directly, unlike the (broken) ClippingPlaneCollection ENU
        // approach we tried previously.
        // -----------------------------------------------------------------
        const dims = await applyBuildingClip(Cesium, tileset, coords);
        if (!cancelled) setDimensions(dims);


        // LOCK the camera to orbit around the selected target — pin stays
        // centered. Usually this is the address; when OSM misses and Solar
        // has a building bbox, it snaps to the bbox center instead.
        // `lookAtTransform(ENU(target), HPR)` pins the camera reference frame
        // at the building. User drag → orbit around target (NOT free pan).
        // Disable translation so user can never wander off the building.
        const viewCoords = dims?.target ?? coords;
        const { lat, lng } = viewCoords;
        // Initial target uses the fallback height so the camera is at least
        // above ground while we wait for the height sample.
        let target = Cesium.Cartesian3.fromDegrees(lng, lat, DEFAULT_GROUND_HEIGHT_M);
        targetRef.current = target;
        const lockToTarget = (t: typeof target) => {
          viewer.scene.camera.lookAtTransform(
            Cesium.Transforms.eastNorthUpToFixedFrame(t),
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(DEFAULT_PRESET.heading),
              Cesium.Math.toRadians(DEFAULT_PRESET.pitch),
              DEFAULT_PRESET.range,
            ),
          );
        };
        lockToTarget(target);
        const controller = viewer.scene.screenSpaceCameraController;
        controller.enableTranslate = false;
        controller.minimumZoomDistance = MINIMUM_ZOOM_DISTANCE_M;
        // Cap zoom-out so the user can't fly out into space and lose the
        // building. 600 m is enough to see neighborhood context on the
        // tightest building footprints.
        controller.maximumZoomDistance = 600;

        // Cross-platform wheel zoom. Cesium's default wheel handler scales
        // movement linearly with deltaY: a macOS trackpad pinch fires
        // deltaY ~1–10 per gesture tick (smooth), but a Windows mouse wheel
        // fires deltaY ~100+ per detent — so the camera leaps 50–100 m per
        // click. We do NOT replace Cesium's WHEEL handler (that path drifts
        // the camera off its lookAtTransform anchor and made the photoreal
        // mesh disappear from view). Instead we re-pin the lookAtTransform
        // immediately after every wheel event using the current heading +
        // pitch + a clamped range. Cesium has already moved the camera by
        // that point — we just normalise where it ended up.
        const ZOOM_BOUNDS_MIN = MINIMUM_ZOOM_DISTANCE_M;
        const ZOOM_BOUNDS_MAX = 600;
        const wheelZoom = (e: WheelEvent) => {
          // Only act on real vertical wheel intent. Horizontal trackpad
          // swipes shouldn't move the camera.
          if (Math.sign(e.deltaY) === 0) return;
          // Allow Cesium's default wheel handler to run first; we re-pin
          // on the next frame so heading/pitch are read after Cesium
          // applied its movement, not before.
          requestAnimationFrame(() => {
            if (!viewerRef.current || viewerRef.current.isDestroyed?.()) return;
            const t = targetRef.current;
            if (!t) return;
            const camera = viewer.scene.camera;
            const range = Cesium.Cartesian3.magnitude(camera.position);
            if (!Number.isFinite(range) || range <= 0) return;
            // Inside bounds → leave the camera alone (Cesium's transform
            // is intact). Only re-pin when we'd otherwise leave bounds.
            if (range >= ZOOM_BOUNDS_MIN && range <= ZOOM_BOUNDS_MAX) return;
            const heading = camera.heading;
            const pitch = camera.pitch;
            const clamped = Math.max(ZOOM_BOUNDS_MIN, Math.min(ZOOM_BOUNDS_MAX, range));
            camera.lookAtTransform(
              Cesium.Transforms.eastNorthUpToFixedFrame(t),
              new Cesium.HeadingPitchRange(heading, pitch, clamped),
            );
          });
        };
        viewer.scene.canvas.addEventListener("wheel", wheelZoom, { passive: true });
        wheelHandlerRef.current = wheelZoom;

        // Tiles need to be near the camera before sampleHeightMostDetailed
        // returns useful data. Pointing the camera at the location first —
        // which we just did — kicks off that streaming. Sample after a beat
        // and re-lock with the actual ground height. This jump is invisible
        // because the tileset itself is still painting in the same window.
        setTimeout(async () => {
          if (cancelled || !viewerRef.current) return;
          const groundHeight = await sampleGroundHeight(Cesium, viewer, lng, lat);
          if (cancelled || !viewerRef.current) return;
          target = Cesium.Cartesian3.fromDegrees(lng, lat, groundHeight);
          targetRef.current = target;
          lockToTarget(target);
          // Re-pin at the corrected ground height so the dot doesn't sink
          // into the mesh on the side / front views.
          viewer.entities.removeAll();
          viewer.entities.add({
            position: target,
            point: {
              pixelSize: 28,
              color: Cesium.Color.fromCssColorString("#3DAEFF"),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 4,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }, 1500);

        // Pin the selected target — either the address or the snapped Solar
        // bbox center — and keep it screen-centered.
        viewer.entities.add({
          position: target,
          point: {
            // Discreet white dot with a thin cyan ring. The big blue puck
            // we shipped earlier dominated the frame and fought the GLB-
            // extracted aesthetic — this version reads as a tasteful
            // location marker without becoming the focal point.
            pixelSize: 7,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString("#3DAEFF"),
            outlineWidth: 1.5,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        setStatus("ready");
      } catch (err) {
        // Any failure (network, EEA block, missing tiles for this region,
        // expired session, etc.) drops us into the fallback branch which
        // renders the existing Google Maps RoofMap3D below.
        // eslint-disable-next-line no-console
        console.error("[CesiumRoofView] failed to initialize", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      // Detach the wheel listener BEFORE destroying the viewer — once the
      // canvas is gone, removeEventListener is a no-op but it's still good
      // hygiene and avoids any chance of a listener firing on a dead canvas.
      if (wheelHandlerRef.current && viewerRef.current?.scene?.canvas) {
        try {
          viewerRef.current.scene.canvas.removeEventListener(
            "wheel",
            wheelHandlerRef.current,
          );
        } catch {
          /* ignore */
        }
        wheelHandlerRef.current = null;
      }
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* ignore — viewer may already be torn down */
        }
        viewerRef.current = null;
      }
      // Tell the parent we're gone so it drops any references / overlays.
      onViewerReady?.(null);
    };
    // We deliberately mount-once; coords changes are handled by the next
    // effect. apiKey is stable for the page life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // -------------------------------------------------------------------------
  // Re-fly when coords change after the viewer is already up.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cesium: any = await import("cesium");
      if (cancelled || !viewerRef.current) return;

      // Rebuild the clipping polygon for the new building. Polygons live in
      // world ECEF, so we just regenerate the collection from the fresh OSM
      // footprint — no modelMatrix to update.
      const tileset = viewer.scene.primitives.get(0);
      let dims: RoofDimensions | null = null;
      if (tileset) {
        // Drop the old collection first so a no-coverage address reverts to
        // the full neighbourhood mesh instead of inheriting the stale clip.
        tileset.clippingPolygons = undefined;
        dims = await applyBuildingClip(Cesium, tileset, coords);
        if (!cancelled) setDimensions(dims);
      }
      const viewCoords = dims?.target ?? coords;

      // First-paint target uses the selected target; sample the real ground
      // height once the tileset has painted nearby and reset the target then.
      const groundHeight = await sampleGroundHeight(
        Cesium,
        viewer,
        viewCoords.lng,
        viewCoords.lat,
      );
      const target = Cesium.Cartesian3.fromDegrees(
        viewCoords.lng,
        viewCoords.lat,
        groundHeight,
      );
      targetRef.current = target;

      // Move pin to new location (same big visible style as initial mount)
      viewer.entities.removeAll();
      viewer.entities.add({
        position: target,
        point: {
          pixelSize: 28,
          color: Cesium.Color.fromCssColorString("#3DAEFF"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 4,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      // Re-lock camera to new building's ENU frame — keeps pin centered.
      // Release the previous transform first so flyTo can run cleanly, then
      // immediately re-lock at the new target after the flight completes.
      viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.scene.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(target, 60),
        {
          duration: 1.2,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(DEFAULT_PRESET.heading),
            Cesium.Math.toRadians(DEFAULT_PRESET.pitch),
            DEFAULT_PRESET.range,
          ),
          complete: () => {
            const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
            viewer.scene.camera.lookAtTransform(
              enu,
              new Cesium.HeadingPitchRange(
                Cesium.Math.toRadians(DEFAULT_PRESET.heading),
                Cesium.Math.toRadians(DEFAULT_PRESET.pitch),
                DEFAULT_PRESET.range,
              ),
            );
            if (!cancelled) setActivePreset(DEFAULT_PRESET.id);
          },
        },
      );
    })();

    return () => {
      cancelled = true;
    };
    // `coords` is referenced as a whole inside applyBuildingClip; the lat/lng
    // pair is what actually changes between renders, so we depend on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.lat, coords.lng, status]);

  // Auto-orbit removed per UX brainstorm — homeowners want a stable view
  // to confirm "that's my roof", not a cinematic spin. User can drag to
  // rotate manually whenever they want.

  // -------------------------------------------------------------------------
  // Preset camera framings.
  //
  // Re-lock onto the building's local ENU frame at the chosen heading / pitch
  // / range. We snap rather than fly so successive clicks feel responsive —
  // a 1.2 s flyTo per button mash makes the UI feel laggy. `lookAtTransform`
  // with a fresh HeadingPitchRange is effectively instant.
  // -------------------------------------------------------------------------
  const setView = useCallback((preset: CameraPreset) => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    const target = targetRef.current;
    if (!Cesium || !viewer || !target) return;
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
    viewer.scene.camera.lookAtTransform(
      enu,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(preset.heading),
        Cesium.Math.toRadians(preset.pitch),
        preset.range,
      ),
    );
    setActivePreset(preset.id);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // On hard error, fall back to the existing Google Maps 3D view so the user
  // still sees their roof. This covers the EEA-restriction case and any
  // network failure on the tile endpoint.
  if (status === "error") {
    return <RoofMap3D coords={coords} address={address} />;
  }

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 bg-[#0A0E1A]"
        aria-label={
          address ? `Photorealistic 3D view of ${address}` : "Photorealistic 3D view"
        }
      />

      {status === "loading" && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
          <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
          Loading photoreal 3D…
        </div>
      )}

      {status === "ready" && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#62E6A7]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-md bg-[#62E6A7] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-md bg-[#62E6A7]" />
          </span>
          Live photoreal · drag to rotate
        </div>
      )}

      {/* Camera preset row — top-right of the left pane. Snaps the lookAt
          transform to a fixed framing so the user can compare e.g. roof
          pitch (-60°) vs front elevation (-15°) vs top-down (-90°). */}
      {status === "ready" && (
        <div
          role="toolbar"
          aria-label="Camera presets"
          className="absolute top-4 right-4 z-10 flex flex-wrap justify-end gap-1 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur p-1"
        >
          {CAMERA_PRESETS.map((preset) => {
            const active = preset.id === activePreset;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setView(preset)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded text-[11px] tracking-tight transition-colors ${
                  active
                    ? "bg-[#3DAEFF] text-[#0A0E1A] font-medium"
                    : "text-[#9BA3AF] hover:text-[#F7F8FA] hover:bg-[#12161C]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setView(DEFAULT_PRESET)}
            aria-label="Recenter"
            title="Recenter"
            className="px-2 py-1 rounded text-[11px] text-[#9BA3AF] hover:text-[#F7F8FA] hover:bg-[#12161C] transition-colors"
          >
            🎯
          </button>
        </div>
      )}

      {/* Dimensions disclosure — sits below the preset row. Header is always
          visible and clickable; the body (length × width × area × pitch)
          collapses to keep the 3D mesh unobstructed when the user wants it. */}
      {status === "ready" && dimensions && (
        <div className="absolute top-16 right-4 z-10 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur text-[11px] text-[#9BA3AF] overflow-hidden">
          <button
            type="button"
            onClick={() => setDimsOpen((v) => !v)}
            aria-expanded={dimsOpen}
            aria-controls="cesium-dimensions-body"
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#5B6470] hover:text-[#9BA3AF] transition-colors"
          >
            <span>
              Dimensions
              <span className="ml-1.5 normal-case tracking-normal text-[9px] text-[#5B6470]">
                ({dimensions.source === "osm"
                  ? "OSM"
                  : dimensions.source === "solar-bbox"
                    ? "Solar bbox · snapped"
                  : dimensions.source === "circle"
                    ? "Circle"
                    : "Solar"})
              </span>
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
              className={`transition-transform ${dimsOpen ? "rotate-180" : ""}`}
            >
              <path
                d="M2 4l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {dimsOpen && (
            <div
              id="cesium-dimensions-body"
              className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums px-3 pb-2 pt-0.5 border-t border-[#2A3038]"
            >
              <span>Length</span>
              <span className="text-right text-[#F7F8FA]">
                {dimensions.lengthM.toFixed(1)} m
              </span>
              <span>Width</span>
              <span className="text-right text-[#F7F8FA]">
                {dimensions.widthM.toFixed(1)} m
              </span>
              <span>Footprint</span>
              <span className="text-right text-[#F7F8FA]">
                {Math.round(dimensions.footprintAreaM2)} m²
              </span>
              {dimensions.source === "circle" && (
                <span className="col-span-2 max-w-[180px] pt-1 text-[#F2B84B]">
                  ⚠ Building not detected — approximate
                </span>
              )}
              {dimensions.totalRoofAreaM2 != null &&
                dimensions.totalRoofAreaM2 > 0 && (
                  <>
                    <span>Roof area</span>
                    <span className="text-right text-[#F7F8FA]">
                      {Math.round(dimensions.totalRoofAreaM2)} m²
                    </span>
                  </>
                )}
              {dimensions.roofPitchDeg != null && (
                <>
                  <span>Pitch</span>
                  <span className="text-right text-[#F7F8FA]">
                    {Math.round(dimensions.roofPitchDeg)}°
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {address && status === "ready" && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[70%] truncate rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#9BA3AF]">
          {address}
        </div>
      )}
    </>
  );
}
