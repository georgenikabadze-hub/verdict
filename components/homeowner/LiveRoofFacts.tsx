"use client";

import { RoofSegment } from "@/lib/contracts";

interface Props {
  segments: RoofSegment[];
  totalAreaM2?: number;
  imageryDate?: { year: number; month: number; day: number };
  source: "live" | "cached" | "mock";
  /** "ok" = real result; "error"/"timeout" = upstream failure (changes empty-state copy) */
  status?: "ok" | "error" | "timeout";
  /** Human-readable reason when segments is empty */
  message?: string;
  loading?: boolean;
}

export function LiveRoofFacts({
  segments,
  totalAreaM2,
  imageryDate,
  source,
  status = "ok",
  message,
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
          <div className="h-2 w-2 animate-pulse rounded-md bg-[#3DAEFF]" />
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
    const isCoverageGap = status === "ok"; // server distinguishes 404 from real errors
    const headline = isCoverageGap
      ? "No live roof measurement at this location"
      : "Roof measurement temporarily unavailable";
    const subline =
      message ?? (isCoverageGap ? "Google Solar API has no building data here" : "Try again in a moment");
    return (
      <div className="flex h-[52px] w-full items-center justify-between rounded-md border border-[#F2B84B]/40 bg-[#12161C]/85 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-md bg-[#F2B84B]" />
          <span className="text-xs text-[#F7F8FA]">{headline}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF] truncate ml-2 max-w-[60%] text-right">
          {subline}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:h-[52px] w-full items-start sm:items-center justify-between gap-3 sm:gap-0 rounded-md border border-[#2A3038] bg-[#12161C]/85 p-3 sm:py-0 sm:px-4 backdrop-blur transition-all">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-md ${badgeColor}`} />
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

      <div className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-[#0A0E1A] ${badgeColor}`}>
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
