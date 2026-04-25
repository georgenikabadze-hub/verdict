"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

interface Props {
  coords: { lat: number; lng: number } | null;
  address: string | null;
}

export function RoofMap3D({ coords, address }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Initialise the map once, when we first have coords.
  useEffect(() => {
    if (!apiKey || !coords || mapRef.current || !containerRef.current) return;

    setStatus("loading");
    setOptions({ key: apiKey, v: "weekly" });

    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(([{ Map }]) => {
        if (!containerRef.current) return;
        const map = new Map(containerRef.current, {
          center: { lat: coords.lat, lng: coords.lng },
          zoom: 20,
          tilt: 45,
          heading: 0,
          mapTypeId: "satellite",
          gestureHandling: "greedy",
          disableDefaultUI: true,
          zoomControl: true,
          rotateControl: true,
        });
        mapRef.current = map;

        markerRef.current = new google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map,
          title: address ?? "Your home",
        });

        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [apiKey, coords, address]);

  // Re-center on every coords change after map exists
  useEffect(() => {
    if (!mapRef.current || !coords) return;
    mapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
    mapRef.current.setZoom(20);
    if (markerRef.current) {
      markerRef.current.setPosition({ lat: coords.lat, lng: coords.lng });
      markerRef.current.setTitle(address ?? "Your home");
    } else {
      markerRef.current = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: mapRef.current,
        title: address ?? "Your home",
      });
    }
  }, [coords, address]);

  if (!coords) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 bg-[#0A0E1A]"
        aria-label={address ? `3D map of ${address}` : "3D map of your address"}
      />
      {status === "loading" && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
          <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
          Loading 3D view…
        </div>
      )}
      {status === "ready" && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#62E6A7]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-md bg-[#62E6A7] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-md bg-[#62E6A7]" />
          </span>
          Live 3D · drag to rotate
        </div>
      )}
      {status === "error" && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#F2B84B]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
          <span className="inline-block h-2 w-2 rounded-md bg-[#F2B84B]" />
          3D view unavailable
        </div>
      )}
    </>
  );
}
