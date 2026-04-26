"use client";

import { useEffect, useRef } from "react";

// We import Cesium dynamically inside the effect (matching CesiumRoofViewInner's
// pattern) so the heavy bundle is never pulled at module-eval time. The Viewer
// type can't be reliably imported synchronously without eagerly pulling Cesium,
// so we fall back to `any` for the viewer instance — same as the rest of the
// Cesium-touching code in this repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumViewer = any;

export interface SolarPanelEntry {
  center: { latitude: number; longitude: number };
  orientation: "LANDSCAPE" | "PORTRAIT";
  segmentIndex: number;
  yearlyEnergyDcKwh: number;
  /** Optional per-segment azimuth so we can rotate the rectangle to roof axis.
   *  When absent, we fall back to 0° (north-aligned) which is still rectangular
   *  and obviously a panel — just not perfectly tucked to the slope direction. */
  segmentAzimuthDegrees?: number;
  /** WGS84 ellipsoidal height in metres at the panel center. Without this
   *  the panel would render at sea level (i.e. underground for any building
   *  not at the coast). Comes from Solar API roofSegmentStats[i].planeHeightAtCenterMeters
   *  for AI-placed panels, or from Cesium scene.pickPosition for manually
   *  placed panels. */
  segmentHeightMeters?: number;
  /** Segment pitch (degrees, 0=flat). Combined with azimuth + center lat/lng
   *  + height, this defines the analytic roof plane each panel corner is
   *  projected onto so panels lie ON the slope rather than floating flat at
   *  the segment-center height. */
  segmentPitchDegrees?: number;
  /** Segment center lat/lng — the reference point for the plane equation.
   *  When absent, plane-fit falls back to flat at segmentHeightMeters. */
  segmentCenterLat?: number;
  segmentCenterLng?: number;
  /** Manually-placed panels carry this flag so we can style them differently
   *  (e.g. green vs blue) and so the click handler knows it's removing a
   *  manual panel, not toggling an AI panel. */
  manual?: boolean;
}

interface Props {
  /** Cesium Viewer instance from the parent CesiumRoofView. Null until mounted. */
  viewer: CesiumViewer | null;
  /** Up to 200 panels from /api/roof-facts (Google's per-panel placement). */
  panels: SolarPanelEntry[];
  /** Pick top N by yearlyEnergyDcKwh — matches what the sizer recommended. */
  desiredCount: number;
  /** Stable panel keys the installer toggled off. Greyed but still rendered. */
  removedKeys: Set<string>;
  /** Toggle a panel on/off via its stable key (lat-lng based). */
  onPanelClick: (key: string) => void;
  /** Master visibility toggle — `false` fully removes entities (not just hides). */
  visible: boolean;
  /** Edit mode: when true, clicks on empty roof spots add a new panel at the
   *  clicked position. Off by default — panel-toggling stays click-anywhere. */
  editMode?: boolean;
  /** Called when the installer click-adds a new panel on the photoreal mesh.
   *  The parent should append to its manuallyAddedPanels array. */
  onPanelAdd?: (panel: SolarPanelEntry) => void;
  /** Default azimuth for manually-placed panels (degrees, north=0).
   *  Pass the dominant segment azimuth so manual panels align with the roof. */
  defaultAzimuthDegrees?: number;
  /** Default pitch for manually-placed panels (degrees, 0=flat).
   *  Used by the plane-fit so manual panels tilt with the dominant roof
   *  slope rather than rendering flat at the picked mesh height. */
  defaultPitchDegrees?: number;
  /** Solar API roof segments with centers. Used to infer the clicked roof
   *  plane for manually-placed panels instead of falling back to the dominant
   *  whole-roof segment. */
  roofSegments?: Array<{
    pitchDegrees?: number;
    azimuthDegrees?: number;
    planeHeightAtCenterMeters?: number;
    center?: { latitude?: number; longitude?: number };
  }>;
}

// Real-world residential panel dimensions. Default to a 440 Wp M10 module
// (1.722 m × 1.134 m), which matches Longi Hi-MO 6 / Huawei LUNA-440 in our
// catalog. We bumped these slightly from the prior "minimal panel size" so
// individual modules read clearly against a typical Berlin roof rather than
// looking like dots.
const PANEL_DIMS = {
  LANDSCAPE: { wM: 1.72, hM: 1.13 },
  PORTRAIT: { wM: 1.13, hM: 1.72 },
} as const;

const PANEL_HEIGHT_OFFSET_M = 0.45; // lift clear of photoreal mesh depth noise
const PANEL_THICKNESS_M = 0.05;
const FLAT_SEGMENT_PITCH_DEGREES = 5;
const ENTITY_NAME_PREFIX = "panel-";
const MANUAL_ENTITY_NAME_PREFIX = "manual-";

const ACTIVE_COLOR = "#3DAEFF";       // AI-placed, active
const REMOVED_COLOR = "#F2B84B";      // toggled off (obstruction)
const MANUAL_COLOR = "#62E6A7";       // manually placed by installer

export function panelKey(idx: number, lat: number, lng: number): string {
  return `${ENTITY_NAME_PREFIX}${idx}-${lat.toFixed(6)}-${lng.toFixed(6)}`;
}

function isPanelEntityName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    (name.startsWith(ENTITY_NAME_PREFIX) ||
      name.startsWith(MANUAL_ENTITY_NAME_PREFIX))
  );
}

function distanceMeters2(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const meanLat = ((latA + latB) / 2) * Math.PI / 180;
  const safeCosLat = Math.max(1e-6, Math.abs(Math.cos(meanLat)));
  const dN = (latA - latB) * 111_320;
  const dE = (lngA - lngB) * 111_320 * safeCosLat;
  return dN * dN + dE * dE;
}

function nearestRoofSegment(
  lat: number,
  lng: number,
  segments: NonNullable<Props["roofSegments"]>,
): { index: number; segment: NonNullable<Props["roofSegments"]>[number]; distance2: number } | null {
  let best:
    | { index: number; segment: NonNullable<Props["roofSegments"]>[number]; distance2: number }
    | null = null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segLat = segment.center?.latitude;
    const segLng = segment.center?.longitude;
    if (!Number.isFinite(segLat) || !Number.isFinite(segLng)) continue;
    const distance2 = distanceMeters2(lat, lng, segLat as number, segLng as number);
    if (!best || distance2 < best.distance2) {
      best = { index, segment, distance2 };
    }
  }
  return best;
}

function segmentAnchorHeightForPickedPoint(
  pickedLat: number,
  pickedLng: number,
  segLat: number,
  segLng: number,
  pickedHeight: number,
  pitchDeg: number,
  azimuthDeg: number,
): number {
  if (!Number.isFinite(pickedHeight) || pitchDeg <= 0.5) return pickedHeight;
  const tanPitch = Math.tan((pitchDeg * Math.PI) / 180);
  const azRad = (azimuthDeg * Math.PI) / 180;
  const downE = Math.sin(azRad);
  const downN = Math.cos(azRad);
  const cosLat = Math.cos((segLat * Math.PI) / 180);
  const safeCosLat = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;
  const dE = (pickedLng - segLng) * 111_320 * safeCosLat;
  const dN = (pickedLat - segLat) * 111_320;
  const downhillDist = dE * downE + dN * downN;
  return pickedHeight + tanPitch * downhillDist;
}

/**
 * Project a lat/lng onto the analytic roof plane defined by a segment's center,
 * pitch, azimuth, and ellipsoidal height. Returns the WGS84 height where that
 * point sits on the plane.
 *
 * Plane definition (Google Solar API convention):
 *   - center (segLat, segLng) at height segHeight
 *   - pitch p (deg, 0 = flat)
 *   - azimuth a (deg, north = 0, clockwise) is the DOWNHILL direction the
 *     roof faces (south-facing roof: a = 180)
 *
 * Height at any (lat, lng):
 *   downhillUnit_E = sin(a)
 *   downhillUnit_N = cos(a)
 *   dE = (lng - segLng) * 111320 * cos(segLat)
 *   dN = (lat - segLat) * 111320
 *   downhillDist = dE * downhillUnit_E + dN * downhillUnit_N
 *   height = segHeight - tan(p) * downhillDist
 *
 * For pitch ~ 0 (flat roof) this returns segHeight everywhere — correct.
 */
function planeFitHeight(
  cornerLat: number,
  cornerLng: number,
  segLat: number,
  segLng: number,
  segHeight: number,
  pitchDeg: number,
  azimuthDeg: number,
): number {
  if (!Number.isFinite(segHeight)) return 0;
  if (pitchDeg <= 0.5) return segHeight;
  const tanPitch = Math.tan((pitchDeg * Math.PI) / 180);
  const azRad = (azimuthDeg * Math.PI) / 180;
  const downE = Math.sin(azRad);
  const downN = Math.cos(azRad);
  const cosLat = Math.cos((segLat * Math.PI) / 180);
  const safeCosLat = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;
  const dE = (cornerLng - segLng) * 111_320 * safeCosLat;
  const dN = (cornerLat - segLat) * 111_320;
  const downhillDist = dE * downE + dN * downN;
  return segHeight - tanPitch * downhillDist;
}

/**
 * Compute the 4 corners of a rectangular panel centered at (lat, lng), rotated
 * by `azimuthDeg` clockwise from north.
 *
 * We work in metres in a local ENU plane, build the corners, rotate, then
 * convert back to lat/lng deltas via the small-circle approximation:
 *   dLat = m / 111320, dLng = m / (111320 * cos(lat))
 * which is fine for ~2 m panels — sub-cm error.
 */
function panelCorners(
  lat: number,
  lng: number,
  widthM: number,
  heightM: number,
  azimuthDeg: number,
): { lat: number; lng: number }[] {
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  // CCW order in local ENU (east, north): SW, SE, NE, NW
  const local: Array<[number, number]> = [
    [-halfW, -halfH],
    [+halfW, -halfH],
    [+halfW, +halfH],
    [-halfW, +halfH],
  ];

  // Cesium / geographic convention: azimuth 0 = north, increases clockwise.
  // Rotating a vector (e, n) by azimuth A clockwise:
  //   e' =  e * cos(A) + n * sin(A)
  //   n' = -e * sin(A) + n * cos(A)
  const a = (azimuthDeg * Math.PI) / 180;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCosLat = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;

  return local.map(([e, n]) => {
    const eR = e * cosA + n * sinA;
    const nR = -e * sinA + n * cosA;
    const dLat = nR / 111_320;
    const dLng = eR / (111_320 * safeCosLat);
    return { lat: lat + dLat, lng: lng + dLng };
  });
}

/**
 * Snap AI panels onto clean horizontal rows aligned with each roof segment's
 * ridge. We snap V globally into rows, then snap U only inside tight clusters
 * within a row so small Solar API center jitter disappears while wider gaps
 * around chimneys, dormers, skylights, and other obstructions are preserved.
 *
 * Visual effect: rows line up across the roof; gaps within a row stay where
 * Google left them. Manual panels (segmentIndex = -1) are skipped entirely
 * because the user's click site is already authoritative.
 *
 * Returns a NEW array of panels with updated center.lat/lng. Input order is
 * preserved so panelKey()-based mappings (removedKeys) don't shift.
 */
function snapPanelsToGrid(panels: SolarPanelEntry[]): SolarPanelEntry[] {
  // Group by segment (manual panels keep segmentIndex = -1 → bucket apart).
  const bySegment = new Map<number, SolarPanelEntry[]>();
  panels.forEach((p) => {
    const arr = bySegment.get(p.segmentIndex) ?? [];
    arr.push(p);
    bySegment.set(p.segmentIndex, arr);
  });

  // Output indexed by the original panel reference so we can restore input order.
  const out = new Map<SolarPanelEntry, SolarPanelEntry>();

  for (const [segIdx, segPanels] of bySegment) {
    if (segIdx < 0) {
      for (const p of segPanels) out.set(p, p);
      continue;
    }

    const ref = segPanels.find(
      (p) =>
        Number.isFinite(p.segmentCenterLat) &&
        Number.isFinite(p.segmentCenterLng) &&
        Number.isFinite(p.segmentAzimuthDegrees),
    );
    if (!ref) {
      for (const p of segPanels) out.set(p, p);
      continue;
    }

    const segLat = ref.segmentCenterLat as number;
    const segLng = ref.segmentCenterLng as number;
    const azDeg = ref.segmentAzimuthDegrees as number;
    const azRad = (azDeg * Math.PI) / 180;
    const downE = Math.sin(azRad);
    const downN = Math.cos(azRad);
    const ridgeE = Math.cos(azRad);
    const ridgeN = -Math.sin(azRad);
    const cosLat = Math.cos((segLat * Math.PI) / 180);
    const safeCosLat = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;
    const orientationCounts = segPanels.reduce(
      (acc, p) => {
        acc[p.orientation] = (acc[p.orientation] ?? 0) + 1;
        return acc;
      },
      {} as Record<SolarPanelEntry["orientation"], number>,
    );
    const dominantOrientation =
      (orientationCounts.PORTRAIT ?? 0) > (orientationCounts.LANDSCAPE ?? 0)
        ? "PORTRAIT"
        : "LANDSCAPE";
    const rowSpacingM = PANEL_DIMS[dominantOrientation].hM + 0.05;

    interface GridPanel {
      panel: SolarPanelEntry;
      dims: (typeof PANEL_DIMS)[keyof typeof PANEL_DIMS];
      u: number;
      vIdx: number;
    }

    const rows = new Map<number, GridPanel[]>();
    for (const p of segPanels) {
      const dims = PANEL_DIMS[p.orientation] ?? PANEL_DIMS.LANDSCAPE;
      const dE = (p.center.longitude - segLng) * 111_320 * safeCosLat;
      const dN = (p.center.latitude - segLat) * 111_320;
      const u = dE * ridgeE + dN * ridgeN;
      const v = dE * downE + dN * downN;

      const vIdx = Math.round(v / rowSpacingM);
      const row = rows.get(vIdx) ?? [];
      row.push({ panel: p, dims, u, vIdx });
      rows.set(vIdx, row);
    }

    for (const row of rows.values()) {
      row.sort((a, b) => a.u - b.u);

      const runs: GridPanel[][] = [];
      let currentRun: GridPanel[] = [];
      for (const item of row) {
        const prev = currentRun[currentRun.length - 1];
        if (!prev) {
          currentRun.push(item);
          continue;
        }

        const gap = item.u - prev.u;
        const clusterThreshold = 1.3 * Math.max(prev.dims.wM, item.dims.wM);
        if (gap <= clusterThreshold) {
          currentRun.push(item);
        } else {
          runs.push(currentRun);
          currentRun = [item];
        }
      }
      if (currentRun.length > 0) runs.push(currentRun);

      for (const run of runs) {
        const avgPanelWidth =
          run.reduce((sum, item) => sum + item.dims.wM, 0) / run.length;
        const runCenterU =
          run.reduce((sum, item) => sum + item.u, 0) / run.length;
        const startU = runCenterU - ((run.length - 1) * avgPanelWidth) / 2;

        run.forEach((item, runIdx) => {
          const uS = run.length === 1 ? item.u : startU + runIdx * avgPanelWidth;
          const vS = item.vIdx * rowSpacingM;
          const dE_s = uS * ridgeE + vS * downE;
          const dN_s = uS * ridgeN + vS * downN;
          const newLat = segLat + dN_s / 111_320;
          const newLng = segLng + dE_s / (111_320 * safeCosLat);

          out.set(item.panel, {
            ...item.panel,
            center: { latitude: newLat, longitude: newLng },
          });
        });
      }
    }
  }

  return panels.map((p) => out.get(p) ?? p);
}

/**
 * Fully removes any entity whose name starts with our prefix. We track entities
 * by stable name (panel-${idx}-${lat}-${lng}), so on every render we tear down
 * and rebuild — keeps the diff logic simple and the entity count bounded by
 * `desiredCount` (≤ 200).
 */
function clearPanelEntities(viewer: CesiumViewer): void {
  if (!viewer || viewer.isDestroyed?.()) return;
  const entities = viewer.entities?.values;
  if (!Array.isArray(entities)) return;
  // Iterate over a copy because removeById mutates the underlying array.
  const toRemove = entities.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => isPanelEntityName(e?.name),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toRemove.forEach((e: any) => {
    try {
      viewer.entities.removeById(e.id);
    } catch {
      // Ignore — entity may have been removed by a prior teardown
    }
  });
}

export function PanelOverlayCesium({
  viewer,
  panels,
  desiredCount,
  removedKeys,
  onPanelClick,
  visible,
  editMode = false,
  onPanelAdd,
  defaultAzimuthDegrees = 0,
  defaultPitchDegrees = 0,
  roofSegments = [],
}: Props) {
  // Stash the latest callbacks + edit-mode flag in refs so the
  // ScreenSpaceEventHandler — which is keyed only on `viewer` — always reads
  // the freshest values without us tearing the handler down on every render.
  const onClickRef = useRef(onPanelClick);
  const editModeRef = useRef(editMode);
  const onPanelAddRef = useRef<((panel: SolarPanelEntry) => void) | undefined>(onPanelAdd);
  const defaultAzimuthRef = useRef(defaultAzimuthDegrees);
  const defaultPitchRef = useRef(defaultPitchDegrees);
  const roofSegmentsRef = useRef(roofSegments);
  const calibratedSegmentHeightsRef = useRef<Map<number, number> | undefined>(undefined);
  const calibratedSignatureRef = useRef<string>("");

  useEffect(() => {
    onClickRef.current = onPanelClick;
  }, [onPanelClick]);
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    onPanelAddRef.current = onPanelAdd;
  }, [onPanelAdd]);
  useEffect(() => {
    defaultAzimuthRef.current = defaultAzimuthDegrees;
  }, [defaultAzimuthDegrees]);
  useEffect(() => {
    defaultPitchRef.current = defaultPitchDegrees;
  }, [defaultPitchDegrees]);
  useEffect(() => {
    roofSegmentsRef.current = roofSegments;
  }, [roofSegments]);

  // -------------------------------------------------------------------------
  // Render panel polygons.
  //
  // Two-phase render to handle the height-datum mismatch between Google
  // Solar API (`planeHeightAtCenterMeters` is "above sea level" / orthometric)
  // and Photoreal 3D Tiles (WGS84 ellipsoidal). In Berlin the geoid undulation
  // is ~+45 m, which would land panels metres below the rendered roof if we
  // trusted the Solar API height directly. Resolution strategy:
  //
  //   • Snap input panels onto clean rows (snapPanelsToGrid above) so the
  //     visual layout reads as an actual install, not Google's scatter.
  //   • Phase 1 (sync): render with the last calibrated mesh heights when
  //     available; otherwise use Solar API heights until the first sample
  //     pass finishes.
  //   • Phase 2 (async, after 1.5 s): sample the photoreal mesh at each
  //     UNIQUE SEGMENT CENTER (not each panel — segment centers are
  //     guaranteed to be on roof per Solar API; panel centers might fall
  //     into courtyards or mesh gaps). Compute a global geoid offset from
  //     the FIRST plausible sample, then re-anchor every segment's plane.
  //     Sanity-check each sample against `solarHeight + globalOffset` —
  //     if a sample diverges by > 5 m it's almost certainly hitting
  //     ground / ungenerated mesh and we discard it.
  //
  // We re-run on every input change; each pass fully clears our entities
  // and rebuilds. Entity count stays bounded by `desiredCount` (≤ 200).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    let cancelled = false;

    // Tolerance for trusting a mesh sample against the Solar API plane.
    // 5 m gives us slack for normal roof geometry noise (eaves, dormers)
    // while clearly catching samples that hit the ground (~10–60 m off).
    const SAMPLE_SANITY_TOLERANCE_M = 5;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderPanels = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Cesium: any,
      // Map from segmentIndex → trusted WGS84 plane anchor height. Empty
      // on phase 1; populated on phase 2 with sanity-checked mesh samples
      // (or Solar height + global offset for failed samples).
      segmentHeightMap?: Map<number, number>,
    ) => {
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      clearPanelEntities(viewer);

      if (!visible || desiredCount <= 0 || panels.length === 0) {
        viewer.scene?.requestRender?.();
        return;
      }

      // Sort/slice first, then snap only the displayed panels. Keys are based
      // on the pre-snap Solar API centers so parent-side yield accounting and
      // click toggles use the same stable identity.
      const sorted = [...panels].sort(
        (a, b) => (b.yearlyEnergyDcKwh ?? 0) - (a.yearlyEnergyDcKwh ?? 0),
      );
      const originalSlice = sorted.slice(0, Math.max(0, desiredCount));
      const snappedSlice = snapPanelsToGrid(originalSlice);

      const activeMaterial = Cesium.Color.fromCssColorString(ACTIVE_COLOR).withAlpha(0.7);
      const removedMaterial = Cesium.Color.fromCssColorString(REMOVED_COLOR).withAlpha(0.3);
      const manualMaterial = Cesium.Color.fromCssColorString(MANUAL_COLOR).withAlpha(0.75);
      const outlineColor = Cesium.Color.WHITE.withAlpha(0.6);

      let manualIndex = 0;
      snappedSlice.forEach((panel, idx) => {
        const originalPanel = originalSlice[idx] ?? panel;
        const lat = panel.center.latitude;
        const lng = panel.center.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const dims = PANEL_DIMS[panel.orientation] ?? PANEL_DIMS.LANDSCAPE;
        const azimuth = panel.segmentAzimuthDegrees ?? 0;
        const pitch = panel.segmentPitchDegrees ?? 0;
        const corners = panelCorners(lat, lng, dims.wM, dims.hM, azimuth);

        // Anchor plane at the SEGMENT center (not panel center) so every
        // panel in the same segment shares one calibrated height — that
        // avoids individual panels falling onto courtyards when their own
        // sample fails. Manual panels carry their own segmentCenter == panel
        // center so this still works for click-placed modules.
        const segLat = panel.segmentCenterLat ?? lat;
        const segLng = panel.segmentCenterLng ?? lng;
        const solarHeight = panel.segmentHeightMeters ?? 0;
        const meshHeight = segmentHeightMap?.get(panel.segmentIndex);
        const anchorHeight = Number.isFinite(meshHeight)
          ? (meshHeight as number)
          : solarHeight;
        const renderPitch = Math.abs(pitch) < FLAT_SEGMENT_PITCH_DEGREES ? 0 : pitch;

        const flatHeights: number[] = [];
        for (const c of corners) {
          const h =
            planeFitHeight(c.lat, c.lng, segLat, segLng, anchorHeight, renderPitch, azimuth) +
            PANEL_HEIGHT_OFFSET_M;
          flatHeights.push(c.lng, c.lat, h);
        }

        const key = panel.manual
          ? `manual-${manualIndex++}`
          : panelKey(
              idx,
              originalPanel.center.latitude,
              originalPanel.center.longitude,
            );
        const isRemoved = removedKeys.has(key);
        const material = panel.manual
          ? manualMaterial
          : isRemoved
            ? removedMaterial
            : activeMaterial;

        try {
          viewer.entities.add({
            id: key,
            name: key,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights(flatHeights),
              // perPositionHeight keeps each corner at its own WGS84 height
              // so the rectangle tilts with the roof slope. We deliberately
              // omit `extrudedHeight` here: a single scalar top would build
              // a wedge against per-corner bottoms. The thin outline gives
              // the panel definition without the extrusion artifact.
              perPositionHeight: true,
              material,
              outline: true,
              outlineColor,
              outlineWidth: 1,
            },
          });
        } catch {
          // Cesium can throw on degenerate polygons (collinear corners, NaN
          // heights, etc.). We swallow per-panel so one bad row doesn't kill
          // the whole overlay.
        }
      });

      viewer.scene?.requestRender?.();
    };

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cesium: any = await import("cesium");
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      const initialSeen = new Set<number>();
      const initialSignature = panels
        .filter((p) => {
          if (
            p.segmentIndex < 0 ||
            initialSeen.has(p.segmentIndex) ||
            !Number.isFinite(p.segmentCenterLat) ||
            !Number.isFinite(p.segmentCenterLng)
          ) {
            return false;
          }
          initialSeen.add(p.segmentIndex);
          return true;
        })
        .map(
          (p) =>
            `${p.segmentIndex}:${(p.segmentCenterLat as number).toFixed(6)},${(
              p.segmentCenterLng as number
            ).toFixed(6)}`,
        )
        .join("|");
      if (
        initialSignature &&
        calibratedSignatureRef.current &&
        calibratedSignatureRef.current !== initialSignature
      ) {
        calibratedSegmentHeightsRef.current = undefined;
      }

      // Phase 1: render immediately. After the first successful mesh sample,
      // reuse the calibrated segment heights on later React re-renders so
      // panels do not briefly fall back to Solar API orthometric heights
      // below the photoreal mesh.
      renderPanels(Cesium, calibratedSegmentHeightsRef.current);

      if (!visible || desiredCount <= 0 || panels.length === 0) return;

      // Phase 2: collect unique segment centers (one sample per roof plane
      // instead of one per panel — far fewer samples, far higher hit rate
      // on the photoreal mesh because Solar API guarantees segment centers
      // are on a detected roof).
      interface SegSample {
        segIndex: number;
        lat: number;
        lng: number;
        solarHeight: number;
      }
      const seen = new Set<number>();
      const segSamples: SegSample[] = [];
      for (const p of panels) {
        if (
          p.segmentIndex < 0 ||
          seen.has(p.segmentIndex) ||
          !Number.isFinite(p.segmentCenterLat) ||
          !Number.isFinite(p.segmentCenterLng) ||
          !Number.isFinite(p.segmentHeightMeters)
        ) {
          continue;
        }
        seen.add(p.segmentIndex);
        segSamples.push({
          segIndex: p.segmentIndex,
          lat: p.segmentCenterLat as number,
          lng: p.segmentCenterLng as number,
          solarHeight: p.segmentHeightMeters as number,
        });
      }
      if (segSamples.length === 0) return;
      const sampleSignature = segSamples
        .map((s) => `${s.segIndex}:${s.lat.toFixed(6)},${s.lng.toFixed(6)}`)
        .join("|");
      if (calibratedSignatureRef.current !== sampleSignature) {
        calibratedSegmentHeightsRef.current = undefined;
        calibratedSignatureRef.current = sampleSignature;
      }

      await new Promise((r) => setTimeout(r, calibratedSegmentHeightsRef.current ? 500 : 1500));
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      try {
        if (typeof viewer.scene?.sampleHeightMostDetailed !== "function") return;
        const carts = segSamples.map((s) =>
          Cesium.Cartographic.fromDegrees(s.lng, s.lat),
        );
        let result = await viewer.scene.sampleHeightMostDetailed(carts);
        if (cancelled || !viewer || viewer.isDestroyed?.()) return;
        let finiteCount = result.filter((r: { height?: number } | undefined) =>
          Number.isFinite(r?.height),
        ).length;
        if (finiteCount === 0 && !calibratedSegmentHeightsRef.current) {
          await new Promise((r) => setTimeout(r, 2000));
          if (cancelled || !viewer || viewer.isDestroyed?.()) return;
          result = await viewer.scene.sampleHeightMostDetailed(carts);
          if (cancelled || !viewer || viewer.isDestroyed?.()) return;
          finiteCount = result.filter((r: { height?: number } | undefined) =>
            Number.isFinite(r?.height),
          ).length;
        }

        // Pass 1: derive a global geoid offset from any single trusted sample.
        // We pick the LARGEST (segment with highest planeHeight is most
        // likely a real roof, not a hidden noise segment).
        let globalOffset: number | undefined;
        const candidates = segSamples
          .map((s, i) => ({ s, h: result[i]?.height as number | undefined }))
          .filter((x) => Number.isFinite(x.h));
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.s.solarHeight - a.s.solarHeight);
          const best = candidates[0];
          globalOffset = (best.h as number) - best.s.solarHeight;
        }

        // Pass 2: build the segIndex → trusted-anchor-height map.
        // - If a sample landed within tolerance of (solar + offset), trust it.
        // - Otherwise (failed / wildly off / hit ground), use solar + offset.
        const segHeightMap = new Map<number, number>();
        segSamples.forEach((s, i) => {
          const sampled = result[i]?.height as number | undefined;
          const expected =
            globalOffset !== undefined ? s.solarHeight + globalOffset : undefined;
          if (
            Number.isFinite(sampled) &&
            (expected === undefined ||
              Math.abs((sampled as number) - expected) <= SAMPLE_SANITY_TOLERANCE_M)
          ) {
            segHeightMap.set(s.segIndex, sampled as number);
          } else if (expected !== undefined) {
            segHeightMap.set(s.segIndex, expected);
          } else {
            segHeightMap.set(s.segIndex, s.solarHeight);
          }
        });

        calibratedSegmentHeightsRef.current = segHeightMap;
        calibratedSignatureRef.current = sampleSignature;
        renderPanels(Cesium, segHeightMap);
      } catch {
        // Sampling can throw if the scene tears down mid-await; phase-1
        // entities are still on screen so we just leave them as-is.
      }
    })();

    return () => {
      // Don't clearPanelEntities() here. The render effect's body already
      // calls clearPanelEntities() at the start of every renderPanels() pass
      // BEFORE adding the new entity batch — atomic clear+add. If we ALSO
      // wipe entities in the cleanup, every dep change leaves a visible
      // window where the user sees no panels while the new effect's
      // `await import("cesium")` resolves. That window manifests as the
      // "panels sometimes show, sometimes not" flicker the user reported.
      // Final unmount cleanup is handled by a separate useEffect below
      // (the one keyed only on `viewer`).
      cancelled = true;
    };
  }, [viewer, panels, desiredCount, removedKeys, visible]);

  // -------------------------------------------------------------------------
  // Click handling.
  // Install one ScreenSpaceEventHandler on the viewer canvas. Tear it down on
  // unmount or when the viewer instance changes.
  // - Click on a panel polygon → toggle remove (always, regardless of mode)
  // - Click on empty roof while in editMode → add a new manual panel at the
  //   picked world position
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any = null;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cesium: any = await import("cesium");
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event: any) => {
          if (!viewer || viewer.isDestroyed?.()) return;
          try {
            const picked = viewer.scene.pick(event.position);
            const name: unknown = picked?.id?.name;
            // Hit an existing panel polygon → toggle remove
            if (isPanelEntityName(name)) {
              onClickRef.current(name);
              return;
            }
            // No panel hit. If we're in edit mode, sample the photoreal mesh
            // at the cursor and add a new manual panel there.
            if (!editModeRef.current || !onPanelAddRef.current) return;
            const worldPos = viewer.scene.pickPosition?.(event.position);
            if (!worldPos) return;
            const cartographic = Cesium.Cartographic.fromCartesian(worldPos);
            const lat = Cesium.Math.toDegrees(cartographic.latitude);
            const lng = Cesium.Math.toDegrees(cartographic.longitude);
            const nearest = nearestRoofSegment(lat, lng, roofSegmentsRef.current);
            const nearestSegment = nearest?.segment;
            const segmentCenterLat = nearestSegment?.center?.latitude;
            const segmentCenterLng = nearestSegment?.center?.longitude;
            const segmentAzimuthDegrees =
              nearestSegment?.azimuthDegrees ?? defaultAzimuthRef.current;
            const segmentPitchDegrees =
              nearestSegment?.pitchDegrees ?? defaultPitchRef.current;
            const hasSegmentCenter =
              Number.isFinite(segmentCenterLat) && Number.isFinite(segmentCenterLng);
            const anchorLat = hasSegmentCenter ? (segmentCenterLat as number) : lat;
            const anchorLng = hasSegmentCenter ? (segmentCenterLng as number) : lng;
            const newPanel: SolarPanelEntry = {
              center: { latitude: lat, longitude: lng },
              orientation: "LANDSCAPE",
              segmentIndex: -1,
              yearlyEnergyDcKwh: 0,
              segmentAzimuthDegrees,
              segmentPitchDegrees,
              // Anchor the plane at the nearest Solar API segment center, but
              // solve the anchor height so the plane still passes through the
              // clicked mesh point.
              segmentCenterLat: anchorLat,
              segmentCenterLng: anchorLng,
              segmentHeightMeters: segmentAnchorHeightForPickedPoint(
                lat,
                lng,
                anchorLat,
                anchorLng,
                cartographic.height,
                segmentPitchDegrees,
                segmentAzimuthDegrees,
              ),
              manual: true,
            };
            onPanelAddRef.current(newPanel);
          } catch {
            // Pick / pickPosition can throw if the scene tears down mid-click; ignore.
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK,
      );
    })();

    return () => {
      cancelled = true;
      if (handler && !handler.isDestroyed?.()) {
        try {
          handler.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [viewer]);


  // -------------------------------------------------------------------------
  // Cleanup on unmount: drop all our entities so a remount in strict-mode (or
  // a viewer change) doesn't leave orphan polygons floating in the scene.
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (viewer && !viewer.isDestroyed?.()) {
        clearPanelEntities(viewer);
        viewer.scene?.requestRender?.();
      }
    };
  }, [viewer]);

  return null;
}

export default PanelOverlayCesium;
