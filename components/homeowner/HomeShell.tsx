"use client";

import { useEffect, useState } from "react";
import { IntakePanel } from "./IntakePanel";
import { RoofPreview } from "./RoofPreview";
import { RoofMap3D } from "./RoofMap3D";
import { LiveRoofFacts } from "./LiveRoofFacts";
import type { RoofSegment } from "@/lib/contracts";

interface RoofFactsState {
  segments: RoofSegment[];
  totalAreaM2: number;
  imageryDate?: { year: number; month: number; day: number };
  source: "live" | "cached" | "mock";
}

export function HomeShell() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [roofFacts, setRoofFacts] = useState<RoofFactsState | null>(null);
  const [loadingRoof, setLoadingRoof] = useState(false);

  useEffect(() => {
    if (!coords) {
      setRoofFacts(null);
      return;
    }

    const fetchRoofFacts = async () => {
      setLoadingRoof(true);
      try {
        const res = await fetch(`/api/roof-facts?lat=${coords.lat}&lng=${coords.lng}`);
        const data = await res.json();
        setRoofFacts(data);
      } catch (err) {
        console.error("Failed to fetch roof facts:", err);
      } finally {
        setLoadingRoof(false);
      }
    };

    fetchRoofFacts();
  }, [coords]);

  return (
    <main className="relative min-h-dvh bg-[#0A0E1A] text-[#F7F8FA] flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10 z-30 bg-[#0A0E1A]/80 backdrop-blur">
        <span className="text-base font-semibold tracking-tight">Verdict</span>
        <a
          href="/installer"
          className="text-sm text-[#9BA3AF] hover:text-[#F7F8FA] transition-colors"
        >
          For installers
        </a>
      </nav>

      {/* Two-pane: 3D / satellite roof left, intake right */}
      <section className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-0">
        {/* LEFT */}
        <div className="relative h-[42vh] lg:h-auto bg-[#0A0E1A] border-b lg:border-b-0 lg:border-r border-[#1A1F2A] overflow-hidden">
          {coords ? (
            <RoofMap3D coords={coords} address={address} />
          ) : (
            <RoofPreview coords={coords} address={address} />
          )}
          
          {/* Live Roof Facts Strip */}
          <div className="absolute bottom-16 left-4 right-4 z-20 sm:max-w-2xl">
            {(roofFacts || loadingRoof) && (
              <LiveRoofFacts
                segments={roofFacts?.segments ?? []}
                totalAreaM2={roofFacts?.totalAreaM2}
                imageryDate={roofFacts?.imageryDate}
                source={roofFacts?.source ?? "mock"}
                loading={loadingRoof}
              />
            )}
          </div>

          {!coords && (
            <div className="absolute bottom-6 left-6 text-xs text-[#5B6470] z-10">
              Enter your address or tap &ldquo;Use my location&rdquo; to see your roof
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12 overflow-y-auto">
          <IntakePanel
            onLocate={(c, a) => {
              setCoords(c);
              setAddress(a);
            }}
          />
        </div>
      </section>
    </main>
  );
}
