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

const PANEL_HEIGHT_OFFSET_M = 0.15; // hover ~15 cm above the roof plane
const PANEL_THICKNESS_M = 0.05;
const ENTITY_NAME_PREFIX = "panel-";

const ACTIVE_COLOR = "#3DAEFF";       // AI-placed, active
const REMOVED_COLOR = "#F2B84B";      // toggled off (obstruction)
const MANUAL_COLOR = "#62E6A7";       // manually placed by installer

export function panelKey(idx: number, lat: number, lng: number): string {
  return `${ENTITY_NAME_PREFIX}${idx}-${lat.toFixed(6)}-${lng.toFixed(6)}`;
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
    (e: any) => typeof e?.name === "string" && e.name.startsWith(ENTITY_NAME_PREFIX),
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
}: Props) {
  // Stash the latest callbacks + edit-mode flag in refs so the
  // ScreenSpaceEventHandler — which is keyed only on `viewer` — always reads
  // the freshest values without us tearing the handler down on every render.
  const onClickRef = useRef(onPanelClick);
  const editModeRef = useRef(editMode);
  const onPanelAddRef = useRef<((panel: SolarPanelEntry) => void) | undefined>(onPanelAdd);
  const defaultAzimuthRef = useRef(defaultAzimuthDegrees);

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

  // -------------------------------------------------------------------------
  // Render panel polygons.
  // We re-run on every input change. Each pass: fully clear our entities, then
  // re-add the top-N (or none, when hidden). Keeps the entity count bounded.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.()) return;

    let cancelled = false;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cesium: any = await import("cesium");
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      clearPanelEntities(viewer);

      if (!visible || desiredCount <= 0 || panels.length === 0) {
        viewer.scene?.requestRender?.();
        return;
      }

      const sorted = [...panels].sort(
        (a, b) => (b.yearlyEnergyDcKwh ?? 0) - (a.yearlyEnergyDcKwh ?? 0),
      );
      const slice = sorted.slice(0, Math.max(0, desiredCount));

      const activeMaterial = Cesium.Color.fromCssColorString(ACTIVE_COLOR).withAlpha(0.7);
      const removedMaterial = Cesium.Color.fromCssColorString(REMOVED_COLOR).withAlpha(0.3);
      const manualMaterial = Cesium.Color.fromCssColorString(MANUAL_COLOR).withAlpha(0.75);
      const outlineColor = Cesium.Color.WHITE.withAlpha(0.6);

      slice.forEach((panel, idx) => {
        const lat = panel.center.latitude;
        const lng = panel.center.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const dims = PANEL_DIMS[panel.orientation] ?? PANEL_DIMS.LANDSCAPE;
        const azimuth = panel.segmentAzimuthDegrees ?? 0;
        const corners = panelCorners(lat, lng, dims.wM, dims.hM, azimuth);

        // Real WGS84 height of the roof plane at this panel. Without this we'd
        // place the panel at sea level (= underground in Berlin). Default to
        // 0.15 m only as a last-resort fallback so we still see SOMETHING.
        const baseHeight = (panel.segmentHeightMeters ?? 0) + PANEL_HEIGHT_OFFSET_M;

        const flatHeights: number[] = [];
        for (const c of corners) {
          flatHeights.push(c.lng, c.lat, baseHeight);
        }

        const key = panelKey(idx, lat, lng);
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
              // height + extrudedHeight gives the polygon a slight 5 cm
              // thickness so it reads like a physical module rather than a
              // flat decal. perPositionHeight keeps it in absolute WGS84
              // metres so it survives camera zoom.
              perPositionHeight: true,
              extrudedHeight: baseHeight + PANEL_THICKNESS_M,
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
    })();

    return () => {
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
            if (typeof name === "string" && name.startsWith(ENTITY_NAME_PREFIX)) {
              onClickRef.current(name);
              return;
            }
            // No panel hit. If we're in edit mode, sample the photoreal mesh
            // at the cursor and add a new manual panel there.
            if (!editModeRef.current || !onPanelAddRef.current) return;
            const worldPos = viewer.scene.pickPosition?.(event.position);
            if (!worldPos) return;
            const cartographic = Cesium.Cartographic.fromCartesian(worldPos);
            const newPanel: SolarPanelEntry = {
              center: {
                latitude: Cesium.Math.toDegrees(cartographic.latitude),
                longitude: Cesium.Math.toDegrees(cartographic.longitude),
              },
              orientation: "LANDSCAPE",
              segmentIndex: -1,
              yearlyEnergyDcKwh: 0,
              segmentAzimuthDegrees: defaultAzimuthRef.current,
              segmentHeightMeters: cartographic.height,
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
