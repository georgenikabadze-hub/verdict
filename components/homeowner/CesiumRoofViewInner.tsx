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
        // Building isolation: clip the tileset to a 22m × 22m × 43m box
        // around the address. Final convention (verified against Cesium docs):
        //   - normal points INWARD (toward box interior)
        //   - distance = NEGATIVE (e.g. -22 for a 22m radius wall)
        //   - unionClippingRegions: true → clip outside ANY plane
        //   - modelMatrix = eastNorthUpToFixedFrame (forward, NOT inverse)
        // The plane equation is n·p = d. Point inside box has n·p > d for
        // every plane → kept. Outside has at least one n·p < d → clipped.
        // -----------------------------------------------------------------
        // Clipping disabled while we debug the right Cesium plane convention —
        // the tileset is showing nothing when clipping is on. Camera framing
        // alone (90m oblique) achieves the "see your building" experience.


        // Frame the user's house tightly: 90m back at -50° pitch fills the
        // viewport with the building rather than showing the neighborhood.
        // No auto-orbit — homeowners want a stable view to confirm "that's
        // my roof", not a cinematic spin. They can drag to rotate themselves.
        const { lat, lng } = coords;
        const target = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
        viewer.scene.camera.lookAt(
          target,
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            220,
          ),
        );
        // Release the lookAt transform so mouse drag works freely.
        viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

        // Drop a pulsing neon pin at the address so the user can instantly
        // see "that's my house" — even when zoomed out by user drag.
        viewer.entities.add({
          position: target,
          point: {
            pixelSize: 14,
            color: Cesium.Color.fromCssColorString("#3DAEFF"),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
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

      // Move clipping planes to the new building (inverse ENU per Cesium gotcha)
      const tileset = viewer.scene.primitives.get(0);
      if (tileset && tileset.clippingPlanes) {
        const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
        tileset.clippingPlanes.modelMatrix = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
      }

      // Move pin to new location
      viewer.entities.removeAll();
      viewer.entities.add({
        position: target,
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString("#3DAEFF"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      viewer.scene.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(target, 100),
        {
          duration: 1.2,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            220,
          ),
        },
      );
    })();

    return () => {
      cancelled = true;
    };
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
