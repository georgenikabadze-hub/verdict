"use client";

import dynamic from "next/dynamic";

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
  /** Optional: receive the Cesium Viewer instance once it's mounted. Used by
   *  installer-side overlays (e.g. PanelOverlayCesium) that need to add
   *  entities on top of the photoreal mesh. Pass `null` on teardown. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onViewerReady?: (viewer: any | null) => void;
}

// Lazy-load the heavy CesiumJS bundle (≈4 MB gzipped). It must run client-only
// because Cesium touches `window`, `document`, and `WebGL2RenderingContext`
// the moment it's imported. Keeping it behind dynamic({ ssr:false }) means the
// initial route bundle stays slim and Cesium only ships when the user has
// actually entered an address.
const CesiumRoofViewInner = dynamic(() => import("./CesiumRoofViewInner"), {
  ssr: false,
  loading: () => <CesiumSkeleton />,
});

function CesiumSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E1A]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[200%] bg-[linear-gradient(115deg,transparent_45%,rgba(61,174,255,0.06)_50%,transparent_55%)] animate-[cesium-shimmer_3s_linear_infinite]" />
      </div>
      <div className="relative flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
        Loading photoreal 3D…
      </div>
      <style jsx>{`
        @keyframes cesium-shimmer {
          0% {
            transform: translateX(-30%);
          }
          100% {
            transform: translateX(30%);
          }
        }
      `}</style>
    </div>
  );
}

export function CesiumRoofView({ coords, address, onViewerReady }: Props) {
  return (
    <CesiumRoofViewInner
      coords={coords}
      address={address}
      onViewerReady={onViewerReady}
    />
  );
}

export default CesiumRoofView;
