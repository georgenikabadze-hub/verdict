"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
}

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

// Same viridis stops the bake script uses — keep visually consistent.
const VIRIDIS_STOPS = [
  "rgb(68,1,84)",
  "rgb(64,67,135)",
  "rgb(41,120,142)",
  "rgb(34,167,132)",
  "rgb(121,209,81)",
  "rgb(253,231,36)",
];

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; objectUrl: string; min?: number; max?: number; source: string }
  | { kind: "no_coverage" }
  | { kind: "error"; message: string };

/**
 * Top-down satellite + LIVE Solar annual-flux heatmap overlay generated on
 * demand by /api/heatmap (which calls Solar `dataLayers:get`, downloads the
 * GeoTIFF, colorises it, caches in /tmp). Works for ANY address with Solar
 * coverage — not just pre-baked demo locations.
 */
export function HeatmapView({ coords, address }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  const satelliteUrl = useMemo(() => {
    if (!apiKey) return null;
    return (
      `${STATIC_MAPS_BASE}?center=${coords.lat},${coords.lng}` +
      `&zoom=20&size=640x640&scale=2&maptype=satellite&key=${apiKey}`
    );
  }, [apiKey, coords.lat, coords.lng]);

  // Fetch heatmap PNG from /api/heatmap. Cleans up object URLs on unmount.
  useEffect(() => {
    const controller = new AbortController();
    let urlToRevoke: string | null = null;
    setState({ kind: "loading" });

    fetch(`/api/heatmap?lat=${coords.lat}&lng=${coords.lng}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ kind: "no_coverage" });
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({ kind: "error", message: text.slice(0, 120) || `HTTP ${res.status}` });
          return;
        }
        const blob = await res.blob();
        urlToRevoke = URL.createObjectURL(blob);
        const min = parseFloat(res.headers.get("X-Flux-Min") ?? "");
        const max = parseFloat(res.headers.get("X-Flux-Max") ?? "");
        const source = res.headers.get("X-Heatmap-Source") ?? "live";
        setState({
          kind: "ready",
          objectUrl: urlToRevoke,
          min: Number.isFinite(min) ? min : undefined,
          max: Number.isFinite(max) ? max : undefined,
          source,
        });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setState({ kind: "error", message: e instanceof Error ? e.message : "Fetch failed" });
      });

    return () => {
      controller.abort();
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [coords.lat, coords.lng]);

  // Loading state
  if (state.kind === "loading") {
    return (
      <div className="absolute inset-0">
        {satelliteUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={satelliteUrl} alt="Satellite preview" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/90 backdrop-blur px-4 py-2.5 text-xs text-[#F7F8FA]">
            <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
            Generating solar heatmap… (5–15s)
          </div>
        </div>
      </div>
    );
  }

  // No Solar API coverage
  if (state.kind === "no_coverage") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0E1A] px-6 text-center">
        <div className="rounded-md border border-[#F2B84B]/40 bg-[#0A0E1A]/90 px-3 py-1.5 text-xs text-[#F7F8FA] flex items-center gap-2">
          <span className="h-2 w-2 rounded-md bg-[#F2B84B]" />
          🌞 Solar heatmap unavailable
        </div>
        <p className="mt-3 max-w-sm text-sm text-[#9BA3AF]">
          Google Solar API has no coverage at this location.
        </p>
      </div>
    );
  }

  // Error
  if (state.kind === "error") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0E1A] px-6 text-center">
        <div className="rounded-md border border-[#F36262]/40 bg-[#0A0E1A]/90 px-3 py-1.5 text-xs text-[#F7F8FA]">
          🔴 Couldn&rsquo;t generate heatmap
        </div>
        <p className="mt-3 max-w-sm text-xs text-[#9BA3AF] truncate">{state.message}</p>
      </div>
    );
  }

  // Ready — render satellite + heatmap overlay
  return (
    <div className="absolute inset-0">
      {satelliteUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={satelliteUrl}
          src={satelliteUrl}
          alt={address ? `Satellite view of ${address}` : "Satellite view"}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Heatmap overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={state.objectUrl}
        alt="Annual solar irradiance heatmap"
        className="absolute inset-0 w-full h-full object-cover mix-blend-screen pointer-events-none"
        style={{ opacity: 0.75 }}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E1A]/55 to-transparent pointer-events-none" />

      {/* Header pill */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="h-2 w-2 rounded-md bg-[#62E6A7]" />
        🌞 Solar potential · annual sunshine
        {state.source === "cached" && (
          <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF] ml-1">cached</span>
        )}
      </div>

      {/* Address footer */}
      {address && (
        <div className="absolute bottom-16 left-4 right-4 sm:right-auto sm:max-w-md rounded-md border border-[#2A3038] bg-[#0A0E1A]/90 backdrop-blur px-3 py-2 text-xs text-[#F7F8FA] truncate">
          📍 {address}
        </div>
      )}

      {/* Viridis legend */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1 rounded-md border border-[#2A3038] bg-[#0A0E1A]/85 backdrop-blur px-3 py-2 text-[10px] text-[#9BA3AF]">
        <div className="flex w-full items-center justify-between gap-4 text-[#F7F8FA]">
          <span>Low</span>
          <span>High</span>
        </div>
        <div
          className="h-2 w-32 rounded-md"
          style={{ background: `linear-gradient(to right, ${VIRIDIS_STOPS.join(", ")})` }}
          aria-hidden="true"
        />
        {state.min !== undefined && state.max !== undefined && (
          <div className="flex w-full items-center justify-between gap-4 tabular-nums">
            <span>{Math.round(state.min)}</span>
            <span>kWh/kW/yr</span>
            <span>{Math.round(state.max)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
