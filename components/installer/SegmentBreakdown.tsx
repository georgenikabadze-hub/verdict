"use client";

interface SegmentRow {
  index: number;
  azimuthDegrees: number;
  pitchDegrees: number;
  areaMeters2: number;
  panelsAllocated: number;
  stringId: number;
  azimuthBucket: "E" | "SE" | "S" | "SW" | "W" | "N" | "flat";
  yieldKwhPerYear: number;
  status: "used" | "skipped";
  skipReason?: "too-small" | "north-facing" | "no-panels-left";
}

interface Props {
  rows: SegmentRow[];
  totalPanels: number;
  totalSystemKwp: number;
  mpptStringCount: number;
}

const STRING_COLORS = ["#3DAEFF", "#62E6A7", "#F2B84B", "#F36262"] as const;

function stringColor(stringId: number): string {
  const idx = Math.max(0, stringId - 1) % STRING_COLORS.length;
  return STRING_COLORS[idx];
}

function formatFace(bucket: SegmentRow["azimuthBucket"], azimuth: number): string {
  if (bucket === "flat") return "flat";
  return `${bucket} ${Math.round(azimuth)}°`;
}

function formatPitch(pitch: number): string {
  if (pitch < 5) return "flat";
  return `${Math.round(pitch)}°`;
}

export function SegmentBreakdown({ rows, totalPanels, totalSystemKwp, mpptStringCount }: Props) {
  const allSkipped = rows.length === 0 || rows.every((row) => row.status === "skipped");

  return (
    <section className="rounded-lg border border-[#2A3038] bg-[#12161C] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9BA3AF]">
          Per-segment placement
        </h2>
        <span className="text-[11px] tabular-nums text-[#5B6470]">
          {totalPanels} panels · {totalSystemKwp.toFixed(1)} kWp · {mpptStringCount} MPPT strings
        </span>
      </div>

      {allSkipped ? (
        <div className="rounded-md border border-[#2A3038] bg-[#0A0E1A] px-3 py-3 text-xs text-[#5B6470]">
          Solar API returned no usable segments for this address — sizing fell back to the
          demand-only model.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#2A3038] bg-[#0A0E1A]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2A3038] text-left text-[10px] uppercase tracking-wider text-[#5B6470]">
                <th scope="col" className="px-3 py-2 font-medium">Face</th>
                <th scope="col" className="px-3 py-2 font-medium">Pitch</th>
                <th scope="col" className="px-3 py-2 font-medium">Area</th>
                <th scope="col" className="px-3 py-2 font-medium">Panels</th>
                <th scope="col" className="px-3 py-2 font-medium">String</th>
                <th scope="col" className="px-3 py-2 font-medium">Yield/yr</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const skipped = row.status === "skipped";
                const color = stringColor(row.stringId);
                return (
                  <tr key={row.index} className="border-b border-[#2A3038] last:border-b-0">
                    <td className="px-3 py-2 tabular-nums text-[#F7F8FA]">
                      {formatFace(row.azimuthBucket, row.azimuthDegrees)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[#F7F8FA]">
                      {formatPitch(row.pitchDegrees)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[#F7F8FA]">
                      {Math.round(row.areaMeters2)} m²
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {skipped ? (
                        <span className="text-[#5B6470]">
                          0 <em className="ml-1 italic text-[#5B6470]">(skipped: {row.skipReason ?? "n/a"})</em>
                        </span>
                      ) : (
                        <span className="text-[#F7F8FA]">{row.panelsAllocated}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {skipped ? (
                        <span className="text-[#5B6470]">—</span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 tabular-nums"
                          style={{
                            color,
                            borderColor: `${color}40`,
                            backgroundColor: `${color}14`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          #{row.stringId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[#F7F8FA]">
                      {skipped ? (
                        <span className="text-[#5B6470]">—</span>
                      ) : (
                        `${Math.round(row.yieldKwhPerYear).toLocaleString()} kWh`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
