"use client";

import type { RoofSegment } from "@/lib/contracts";

interface Props {
  segments: RoofSegment[];
  panelCount: number;
}

function headingLabel(azimuth: number): string {
  if (azimuth >= 315 || azimuth < 45) return "North";
  if (azimuth < 135) return "East";
  if (azimuth < 225) return "South";
  return "West";
}

export function PanelLayoutPreview({ segments, panelCount }: Props) {
  const usable = segments
    .map((segment, index) => ({
      ...segment,
      index,
      capacity: Math.max(0, Math.floor((segment.areaMeters2 / 1.7) * 0.7)),
    }))
    .filter((segment) => segment.capacity > 0);
  const areaTotal = usable.reduce((sum, segment) => sum + segment.areaMeters2, 0);

  let remaining = panelCount;
  const distribution = usable.map((segment) => {
    const weighted = Math.max(
      1,
      Math.round(panelCount * (segment.areaMeters2 / Math.max(1, areaTotal))),
    );
    const count = Math.min(segment.capacity, weighted, remaining);
    remaining -= count;
    return { ...segment, count };
  });

  for (const segment of distribution) {
    if (remaining <= 0) break;
    const add = Math.min(segment.capacity - segment.count, remaining);
    segment.count += add;
    remaining -= add;
  }

  return (
    <section className="rounded-lg border border-[#2A3038] bg-[#12161C] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9BA3AF]">
          AI starting layout
        </h3>
        <span className="text-[11px] text-[#5B6470]">drag-to-edit coming soon</span>
      </div>
      <svg viewBox="0 0 420 180" className="h-44 w-full" role="img" aria-label="Panel layout preview">
        {distribution.map((segment, segmentIndex) => {
          const cols = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(segment.count))));
          const rows = Math.max(1, Math.ceil(segment.count / cols));
          const groupWidth = cols * 18 + 28;
          const x = 16 + segmentIndex * 132;
          const y = 42;
          return (
            <g key={`${segment.azimuthDegrees}-${segment.index}`} transform={`translate(${x} ${y})`}>
              <rect
                x="0"
                y="0"
                width={Math.min(120, groupWidth)}
                height={Math.min(112, rows * 14 + 28)}
                rx="8"
                fill="#0A0E1A"
                stroke="#2A3038"
              />
              <text x="8" y="17" fill="#9BA3AF" fontSize="10">
                {headingLabel(segment.azimuthDegrees)} {Math.round(segment.azimuthDegrees)}°
              </text>
              {Array.from({ length: segment.count }).map((_, panelIndex) => {
                const col = panelIndex % cols;
                const row = Math.floor(panelIndex / cols);
                return (
                  <rect
                    key={panelIndex}
                    x={8 + col * 14}
                    y={28 + row * 12}
                    width="10"
                    height="8"
                    rx="2"
                    fill="#3DAEFF"
                    opacity="0.82"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
