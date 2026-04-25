"use client";

import { useEffect, useState } from "react";

interface Props {
  coords: { lat: number; lng: number } | null;
  address: string | null;
}

function PlaceholderSvg() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg
        viewBox="0 0 400 280"
        className="w-[80%] max-w-2xl opacity-90"
        aria-hidden="true"
      >
        <polygon points="80,180 320,180 320,260 80,260" fill="#12161C" stroke="#2A3038" strokeWidth="1.5" />
        <polygon points="60,180 200,80 340,180" fill="#1A1F2A" stroke="#2A3038" strokeWidth="1.5" />
        {Array.from({ length: 12 }).map((_, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          return (
            <rect
              key={i}
              x={130 + col * 35}
              y={110 + row * 22}
              width="30"
              height="18"
              fill="#0A0E1A"
              stroke="#3DAEFF"
              strokeWidth="0.7"
              opacity="0.85"
            />
          );
        })}
        <rect x="184" y="220" width="32" height="40" fill="#0A0E1A" stroke="#2A3038" />
        <line x1="60" y1="180" x2="200" y2="80" stroke="#3DAEFF" strokeWidth="0.6" opacity="0.5" />
        <line x1="200" y1="80" x2="340" y2="180" stroke="#3DAEFF" strokeWidth="0.6" opacity="0.5" />
      </svg>
    </div>
  );
}

export function RoofPreview({ coords, address }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");

  // Reset img state every time coords change
  useEffect(() => {
    if (coords) setImgState("loading");
  }, [coords]);

  if (!coords || !apiKey) {
    return <PlaceholderSvg />;
  }

  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=20&size=640x640&scale=2&maptype=satellite&markers=color:0x3DAEFF%7C${coords.lat},${coords.lng}&key=${apiKey}`;

  return (
    <div className="absolute inset-0">
      {/* key={src} forces re-mount on URL change so onLoad fires every time */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        className={imgState === "loaded" ? "absolute inset-0 w-full h-full object-cover" : "hidden"}
        onLoad={() => setImgState("loaded")}
        onError={() => setImgState("error")}
      />

      {/* Loading state — show placeholder + spinner */}
      {imgState === "loading" && (
        <>
          <PlaceholderSvg />
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
            <span className="text-[#F7F8FA]">Loading aerial view…</span>
          </div>
        </>
      )}

      {/* Error state — fall back to placeholder + amber badge */}
      {imgState === "error" && (
        <>
          <PlaceholderSvg />
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-md border border-[#F2B84B]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F2B84B]" />
            <span className="text-[#F7F8FA]">Satellite unavailable</span>
          </div>
        </>
      )}

      {/* Loaded state — overlays */}
      {imgState === "loaded" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-tr from-[#0A0E1A]/55 via-transparent to-[#0A0E1A]/30" />
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-md border border-[#62E6A7]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#62E6A7] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#62E6A7]" />
            </span>
            <span className="text-[#F7F8FA]">Live satellite</span>
          </div>
        </>
      )}

      {/* Address label always visible when coords present */}
      {address && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto rounded-md border border-[#2A3038] bg-[#0A0E1A]/90 backdrop-blur px-3 py-2 text-xs text-[#F7F8FA] max-w-md truncate">
          📍 {address}
        </div>
      )}
    </div>
  );
}
