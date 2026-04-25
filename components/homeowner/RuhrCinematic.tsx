"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Dynamic import keeps three.js + drei + the loader code out of the main
// route bundle — they only ship when this component actually mounts (i.e.
// before the user has entered an address). ssr: false because R3F's Canvas
// touches `window` immediately.
const RuhrCinematicScene = dynamic(() => import("./RuhrCinematicScene"), {
  ssr: false,
  loading: () => <CinematicSkeleton />,
});

function CinematicSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E1A]">
      {/* Subtle animated scanline so the skeleton feels alive */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[200%] bg-[linear-gradient(115deg,transparent_45%,rgba(61,174,255,0.06)_50%,transparent_55%)] animate-[shimmer_3s_linear_infinite]" />
      </div>
      <div className="relative flex items-center gap-3 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-4 py-2 text-xs text-[#F7F8FA]">
        <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
        Loading 3D scan…
      </div>
      <style jsx>{`
        @keyframes shimmer {
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

export function RuhrCinematic() {
  return (
    <div className="absolute inset-0">
      <Suspense fallback={<CinematicSkeleton />}>
        <RuhrCinematicScene />
      </Suspense>

      {/* Vignette to match the rest of the dark UI */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#0A0E1A]/55 via-transparent to-[#0A0E1A]/30" />

      {/* Corner badge */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-md bg-[#3DAEFF] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-md bg-[#3DAEFF]" />
        </span>
        Cm-precision drone scan · Reonic Ruhr dataset
      </div>
    </div>
  );
}
