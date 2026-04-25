"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  coords: { lat: number; lng: number };
  address: string | null;
}

type State = "ready" | "rendering" | "not_found" | "error";

interface ApiResponse {
  videoUrl: string | null;
  state: State;
  message?: string;
}

const POLL_INTERVAL_MS = 10_000;
// Stop polling after ~5 minutes — Google says renders take 1–3 minutes; if we
// haven't gotten a video by then, something is wrong (or the address has no
// photoreal coverage and the render job will never produce a result).
const MAX_POLL_ATTEMPTS = 30;

/**
 * Aerial Video View — pre-rendered cinematic 360° fly-by from Google's
 * Aerial View API. Sibling to CesiumRoofView; HomeShell will wire one or the
 * other into the LayerSwitcher (a separate agent owns that wiring).
 *
 * Flow:
 *   1. Fetch /api/aerial-view → if videoUrl present, autoplay it muted/looped
 *   2. If state="rendering", show spinner + "Generating aerial fly-by…" copy
 *      and re-poll every 10s for up to ~5 minutes.
 *   3. If state="not_found" or "error", render fallback copy suggesting the
 *      "Map" or "3D View" tabs in the LayerSwitcher.
 */
export function AerialVideoView({ coords, address }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    // Reset state on every coords change — old polls from the previous
    // address must not leak into the new lookup.
    setData(null);
    setPolling(false);
    attemptsRef.current = 0;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const fetchOnce = async () => {
      attemptsRef.current += 1;
      try {
        const res = await fetch(
          `/api/aerial-view?lat=${coords.lat}&lng=${coords.lng}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(json);

        if (json.state === "rendering" && attemptsRef.current < MAX_POLL_ATTEMPTS) {
          setPolling(true);
          timer = setTimeout(fetchOnce, POLL_INTERVAL_MS);
        } else {
          setPolling(false);
          if (json.state === "rendering") {
            // Hit the cap without a ready video — surface a graceful error.
            setData({
              videoUrl: null,
              state: "error",
              message: "Render is taking longer than expected. Try again later.",
            });
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData({
          videoUrl: null,
          state: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        setPolling(false);
      }
    };

    fetchOnce();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [coords.lat, coords.lng]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="absolute inset-0 bg-[#0A0E1A]">
      {data?.state === "ready" && data.videoUrl ? (
        <video
          key={data.videoUrl}
          src={data.videoUrl}
          autoPlay
          muted
          loop
          playsInline
          // The fly-by is the focal subject; cover the pane like a hero video.
          className="absolute inset-0 w-full h-full object-cover"
          aria-label={
            address
              ? `Aerial fly-by video of ${address}`
              : "Aerial fly-by video"
          }
        />
      ) : (
        // Background when no video — keep the dark surface so the loading /
        // fallback pill reads cleanly.
        <div className="absolute inset-0 bg-[#0A0E1A]" />
      )}

      {/* Subtle gradient at bottom so footer pill always has contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E1A]/55 to-transparent pointer-events-none" />

      {/* Header pill — neon-blue accent */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#F7F8FA]">
        <span className="h-2 w-2 rounded-md bg-[#3DAEFF]" />
        Aerial fly-by
      </div>

      {/* Center overlay — loading / rendering / error */}
      {(!data || data.state === "rendering" || polling) && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/80 backdrop-blur px-3 py-2 text-xs text-[#F7F8FA] max-w-sm text-center">
            <span className="inline-block h-3 w-3 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin shrink-0" />
            <span>
              {data?.state === "rendering"
                ? "Generating aerial fly-by… (can take 1–3 minutes)"
                : "Looking up aerial fly-by…"}
            </span>
          </div>
        </div>
      )}

      {data && (data.state === "not_found" || data.state === "error") && (
        <div className="absolute inset-0 flex items-center justify-center z-10 px-6">
          <div className="rounded-md border border-[#2A3038] bg-[#0A0E1A]/90 backdrop-blur px-4 py-3 text-xs text-[#F7F8FA] max-w-sm text-center">
            <div className="mb-1 font-medium text-[#F7F8FA]">
              {data.state === "not_found"
                ? "No aerial fly-by available for this address"
                : "Aerial fly-by unavailable"}
            </div>
            <div className="text-[#9BA3AF]">
              Try the <span className="text-[#3DAEFF]">Map</span> or{" "}
              <span className="text-[#3DAEFF]">3D View</span> tab to see this
              property.
            </div>
            {data.message && (
              <div className="mt-2 text-[10px] text-[#5B6470] truncate">
                {data.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer pill — address label */}
      {address && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[70%] truncate rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 backdrop-blur px-3 py-1.5 text-xs text-[#9BA3AF]">
          {address}
        </div>
      )}
    </div>
  );
}

export default AerialVideoView;
