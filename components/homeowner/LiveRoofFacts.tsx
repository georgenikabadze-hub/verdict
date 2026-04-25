"use client";

import { RoofSegment } from "@/lib/contracts";

interface Props {
  segments: RoofSegment[];           // from contracts.ts — pitch, azimuth, area, sunshine
  totalAreaM2?: number;              // optional sum, derive from segments if not provided
  imageryDate?: { year: number; month: number; day: number };  // from Solar API
  source: "live" | "cached" | "mock"; // controls the badge color
  loading?: boolean;
}

export function LiveRoofFacts({
  segments,
  totalAreaM2,
  imageryDate,
  source,
  loading = false,
}: Props) {
  const area = totalAreaM2 ?? segments.reduce((acc, s) => acc + s.areaMeters2, 0);
  const avgPitch = segments.length > 0
    ? segments.reduce((acc, s) => acc + s.pitchDegrees, 0) / segments.length
    : 0;

  // Find best azimuth (one with most sunshine or just first for now if sunshine not provided, but usually we want the one with most area/sunshine)
  // Let's pick the one with the most area as "best" for azimuth display
  const bestAzimuth = segments.length > 0
    ? [...segments].sort((a, b) => b.areaMeters2 - a.areaMeters2)[0].azimuthDegrees
    : 0;

  const getCardinal = (deg: number) => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const getMonthName = (m?: number) => {
    if (!m) return "";
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  };

  const badgeColor = source === "live" ? "bg-[#62E6A7]" : source === "cached" ? "bg-[#F2B84B]" : "bg-[#3DAEFF]";
  const pillText = source === "live" ? "✨ Live measurement" : source === "cached" ? "📦 Cached" : "🛠 Mock";

  if (loading) {
    return (
      <div className="flex h-[52px] w-full items-center justify-center rounded-md border border-[#2A3038] bg-[#12161C]/85 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#3DAEFF]" />
          <span className="text-xs font-medium text-[#9BA3AF] animate-pulse">Detecting roof faces...</span>
        </div>
        <div className="absolute right-4 hidden sm:flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-2 w-8 animate-pulse rounded bg-[#2A3038]" />
              <div className="h-3 w-10 animate-pulse rounded bg-[#2A3038]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex h-[52px] w-full items-center rounded-md border border-[#2A3038] bg-[#12161C]/85 px-4 backdrop-blur">
        <span className="text-xs text-[#9BA3AF]">No roof data available — using estimates</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:h-[52px] w-full items-start sm:items-center justify-between gap-3 sm:gap-0 rounded-md border border-[#2A3038] bg-[#12161C]/85 p-3 sm:py-0 sm:px-4 backdrop-blur transition-all">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${badgeColor}`} />
        <span className="text-xs font-bold uppercase tracking-widest text-[#F7F8FA]">Live roof facts</span>
      </div>

      <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-0 sm:justify-center">
        <Stat label="Faces" value={segments.length.toString()} />
        <Divider />
        <Stat label="Total area" value={`${area.toFixed(1)} m²`} />
        <Divider />
        <Stat label="Avg pitch" value={`${Math.round(avgPitch)}°`} />
        <Divider />
        <Stat label="Best azimuth" value={`${Math.round(bestAzimuth)}° (${getCardinal(bestAzimuth)})`} />
        <Divider />
        <Stat
          label="Imagery"
          value={imageryDate ? `${getMonthName(imageryDate.month)} ${imageryDate.year}` : "N/A"}
        />
      </div>

      <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[#0A0E1A] ${badgeColor}`}>
        {pillText}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col px-3 first:pl-0 sm:first:pl-3 last:pr-0">
      <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">{label}</span>
      <span className="text-[13px] sm:text-[14px] font-semibold tabular-nums text-[#F7F8FA]">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block h-6 w-px bg-[#2A3038]" />;
}
