"use client";

import { useEffect, useRef, useState } from "react";
import { CESIUM_BASE_URL, tilesetUrl } from "@/lib/cesium/config";
import { RoofMap3D } from "./RoofMap3D";

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
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

// 5-metre buffer around the Solar API bounding box so eaves, gutters, and
// the patch of garden the homeowner uses for orientation don't get amputated.
const CLIP_BUFFER_METERS = 5;

interface BoundingBox {
  sw: { latitude: number; longitude: number };
  ne: { latitude: number; longitude: number };
}

interface RoofFactsResponse {
  boundingBox?: BoundingBox;
}

/**
 * Convert a metre offset into a degree delta at the given latitude. Latitude
 * degrees are ~111,320 m everywhere; longitude degrees shrink with cos(lat).
 * Good enough for a few-metre buffer around a single building.
 */
function metersToLatLngDelta(
  meters: number,
  refLat: number,
): { dLat: number; dLng: number } {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((refLat * Math.PI) / 180));
  return { dLat, dLng };
}

/**
 * Fetch the building's bounding box from /api/roof-facts and apply a
 * ClippingPolygonCollection that hides everything outside it. Silently
 * no-ops when the API has no coverage — the full neighbourhood mesh
 * stays visible as a graceful fallback.
 */
async function applyBuildingClip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileset: any,
  coords: { lat: number; lng: number },
): Promise<void> {
  try {
    const res = await fetch(
      `/api/roof-facts?lat=${coords.lat}&lng=${coords.lng}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as RoofFactsResponse;
    const bbox = data.boundingBox;
    if (
      !bbox ||
      !Number.isFinite(bbox.sw?.latitude) ||
      !Number.isFinite(bbox.sw?.longitude) ||
      !Number.isFinite(bbox.ne?.latitude) ||
      !Number.isFinite(bbox.ne?.longitude)
    ) {
      // No coverage / fixture branch — leave the neighbourhood visible.
      return;
    }

    const refLat = (bbox.sw.latitude + bbox.ne.latitude) / 2;
    const { dLat, dLng } = metersToLatLngDelta(CLIP_BUFFER_METERS, refLat);

    const swLat = bbox.sw.latitude - dLat;
    const swLng = bbox.sw.longitude - dLng;
    const neLat = bbox.ne.latitude + dLat;
    const neLng = bbox.ne.longitude + dLng;

    // Counter-clockwise quad (SW → SE → NE → NW). Cesium expects positions
    // in degrees as [lng, lat, lng, lat, ...]. With `inverse: false` the
    // collection clips OUTSIDE this polygon — keeping the building.
    const positions = Cesium.Cartesian3.fromDegreesArray([
      swLng, swLat,
      neLng, swLat,
      neLng, neLat,
      swLng, neLat,
    ]);

    const polygon = new Cesium.ClippingPolygon({ positions });
    tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
      polygons: [polygon],
      inverse: false,
    });
  } catch {
    // Network blip / aborted fetch — fall back to no clipping.
  }
}

export default function CesiumRoofViewInner({ coords, address }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // We hold the viewer in a ref so React's strict-mode double-invoke doesn't
  // create two viewers fighting over the same canvas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>("loading");

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

        // Hide the blue WGS84 globe — only the photoreal tileset should render.
        viewer.scene.globe.show = false;
        // Transparent background fits the dark Verdict shell.
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0A0E1A");
        // The default sky gradient looks blue/cloudy; kill it for the hero pane.
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;

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
        // We fetch the building's `boundingBox` from /api/roof-facts (which
        // proxies Google Solar API `buildingInsights:findClosest`). The box
        // gives us SW/NE lat/lng; we extrude it slightly (5m buffer) so eaves
        // and immediate context survive, then build a single 4-vertex polygon
        // in world ECEF via Cartesian3.fromDegreesArray. With `inverse: false`
        // the collection clips OUTSIDE the polygon, leaving only the home
        // visible against the dark scene background.
        //
        // Cesium API references:
        //   https://cesium.com/learn/cesiumjs/ref-doc/ClippingPolygonCollection.html
        //   https://cesium.com/learn/cesiumjs/ref-doc/ClippingPolygon.html
        //
        // No modelMatrix juggling required — polygon vertices live in world
        // ECEF directly, unlike the (broken) ClippingPlaneCollection ENU
        // approach we tried previously.
        // -----------------------------------------------------------------
        await applyBuildingClip(Cesium, tileset, coords);


        // LOCK the camera to orbit around the address — pin stays centered.
        // `lookAtTransform(ENU(target), HPR)` pins the camera reference frame
        // at the building. User drag → orbit around target (NOT free pan).
        // Disable translation so user can never wander off the building.
        const { lat, lng } = coords;
        const target = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(target);
        viewer.scene.camera.lookAtTransform(
          enuTransform,
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            220,
          ),
        );
        viewer.scene.screenSpaceCameraController.enableTranslate = false;

        // Bigger, more visible pin at the address — stays screen-centered.
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
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* ignore — viewer may already be torn down */
        }
        viewerRef.current = null;
      }
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

      const target = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 0);

      // Rebuild the clipping polygon for the new building. Polygons live in
      // world ECEF, so unlike planes we just regenerate the collection from
      // the fresh boundingBox — no modelMatrix to update.
      const tileset = viewer.scene.primitives.get(0);
      if (tileset) {
        // Drop the old collection first so a no-coverage address reverts to
        // the full neighbourhood mesh instead of inheriting the stale clip.
        tileset.clippingPolygons = undefined;
        await applyBuildingClip(Cesium, tileset, coords);
      }

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
        new Cesium.BoundingSphere(target, 100),
        {
          duration: 1.2,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            220,
          ),
          complete: () => {
            const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
            viewer.scene.camera.lookAtTransform(
              enu,
              new Cesium.HeadingPitchRange(
                Cesium.Math.toRadians(0),
                Cesium.Math.toRadians(-45),
                220,
              ),
            );
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

      {address && status === "ready" && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[70%] truncate rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#9BA3AF]">
          {address}
        </div>
      )}
    </>
  );
}
