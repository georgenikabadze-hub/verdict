"use client";

import { useMemo } from "react";
import type { RoofSegment } from "@/lib/contracts";

interface RoofSegmentWithBox extends RoofSegment {
  boundingBox?: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
}

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
  segments: RoofSegmentWithBox[];
  totalAreaM2: number;
}

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

/**
 * Top-down roof plan: aerial satellite at high zoom + neon polygons drawn
 * from Solar API segment bounding boxes. The "I can see the math" view —
 * proves the AI actually measured each face individually.
 */
export function RoofPlanView({ coords, address, segments, totalAreaM2 }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Build static-maps URL with overlay paths for each segment's bounding box.
  // path=color:0x3DAEFF80|fillcolor:0x3DAEFF40|weight:2|...lat,lng pairs...
  const url = useMemo(() => {
    if (!apiKey) return null;
    const base = `${STATIC_MAPS_BASE}?center=${coords.lat},${coords.lng}&zoom=20&size=640x640&scale=2&maptype=satellite&key=${apiKey}`;
    const paths = segments
      .filter((s) => s.boundingBox)
      .slice(0, 8) // static maps URL length limit
      .map((s) => {
        const { sw, ne } = s.boundingBox!;
        // Closed rectangle path
        const pts = [
          `${sw.latitude},${sw.longitude}`,
          `${sw.latitude},${ne.longitude}`,
          `${ne.latitude},${ne.longitude}`,
          `${ne.latitude},${sw.longitude}`,
          `${sw.latitude},${sw.longitude}`,
        ].join("|");
        return `path=color:0x3DAEFFFF|weight:2|fillcolor:0x3DAEFF33|${pts}`;
      })
      .join("&");
    return paths ? `${base}&${paths}` : base;
  }, [apiKey, coords.lat, coords.lng, segments]);

  if (!url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E1A] text-xs text-[#9BA3AF]">
        Roof Plan unavailable (missing Maps API key)
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={url}
        src={url}
        alt={address ? `Roof plan of ${address}` : "Roof plan"}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E1A]/55 to-transparent pointer-events-none" />

      {/* Header pill */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="h-2 w-2 rounded-md bg-[#3DAEFF]" />
        Roof plan · {segments.length} face{segments.length !== 1 ? "s" : ""} measured
      </div>

      {/* Total area pill */}
      <div className="absolute top-4 right-4 z-10 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="text-[#9BA3AF]">Total area · </span>
        <span className="font-semibold tabular-nums">{totalAreaM2.toFixed(1)} m²</span>
      </div>

      {/* Address footer */}
      {address && (
        <div className="absolute bottom-16 left-4 right-4 sm:right-auto sm:max-w-md rounded-md border border-[#2A3038] bg-[#0A0E1A]/90 backdrop-blur px-3 py-2 text-xs text-[#F7F8FA] truncate">
          📍 {address}
        </div>
      )}
    </div>
  );
}
