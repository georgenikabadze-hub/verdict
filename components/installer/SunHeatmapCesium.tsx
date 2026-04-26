"use client";

import { useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumViewer = any;

export interface SunHeatmapMeta {
  imageUrl: string;
  bounds: { south: number; west: number; north: number; east: number };
  fluxRange?: { min: number; max: number };
}

interface Props {
  viewer: CesiumViewer | null;
  heatmap: SunHeatmapMeta | null;
  visible: boolean;
}

const ENTITY_ID = "sun-annual-flux-heatmap";

function clearHeatmap(viewer: CesiumViewer | null): void {
  if (!viewer || viewer.isDestroyed?.()) return;
  try {
    viewer.entities.removeById(ENTITY_ID);
    viewer.scene?.requestRender?.();
  } catch {
    // ignore stale viewer/entity state
  }
}

export function SunHeatmapCesium({ viewer, heatmap, visible }: Props) {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.() || !heatmap) return;

    let cancelled = false;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cesium: any = await import("cesium");
      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      clearHeatmap(viewer);
      if (!visible) return;

      const { south, west, north, east } = heatmap.bounds;
      if (![south, west, north, east].every(Number.isFinite)) return;
      // Bail out if the bounds aren't in WGS84 degrees (lat ∈ [-90, 90],
      // lng ∈ [-180, 180]). Solar API's GeoTIFF returns extents in projected
      // metres (UTM zone for Berlin = millions of metres) — passing those to
      // Rectangle.fromDegrees crashes the Cesium renderer with
      // "Expected north to be less than or equal to π/2". Skip rendering
      // the heatmap until /api/data-layers returns degree bounds; the rest
      // of the scene keeps working without it.
      if (
        Math.abs(south) > 90 ||
        Math.abs(north) > 90 ||
        Math.abs(west) > 180 ||
        Math.abs(east) > 180
      ) {
        // eslint-disable-next-line no-console
        console.warn("[SunHeatmap] bounds out of WGS84 range — skipping render", heatmap.bounds);
        return;
      }

      let height = 60;
      try {
        const centerLat = (south + north) / 2;
        const centerLng = (west + east) / 2;
        if (typeof viewer.scene?.sampleHeightMostDetailed === "function") {
          const sampled = await viewer.scene.sampleHeightMostDetailed([
            Cesium.Cartographic.fromDegrees(centerLng, centerLat),
          ]);
          const h = sampled?.[0]?.height;
          if (Number.isFinite(h)) height = h + 0.05;
        }
      } catch {
        // Flat overlay can still render at the fallback height.
      }

      if (cancelled || !viewer || viewer.isDestroyed?.()) return;

      try {
        viewer.entities.add({
          id: ENTITY_ID,
          name: ENTITY_ID,
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
            height,
            material: new Cesium.ImageMaterialProperty({
              image: heatmap.imageUrl,
              transparent: true,
              color: Cesium.Color.WHITE.withAlpha(0.58),
            }),
            outline: false,
          },
        });
        viewer.scene?.requestRender?.();
      } catch {
        clearHeatmap(viewer);
      }
    })();

    return () => {
      cancelled = true;
      clearHeatmap(viewer);
    };
  }, [viewer, heatmap, visible]);

  return null;
}

export default SunHeatmapCesium;
