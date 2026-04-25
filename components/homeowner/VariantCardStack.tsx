"use client";

import { useState } from "react";
import type { Variant } from "@/lib/contracts";
import { Star, Check } from "lucide-react";

interface Props {
  variants: [Variant, Variant, Variant];   // [margin, closeRate, ltv]
  onSelect?: (variantId: string) => void;
}

export function VariantCardStack({ variants, onSelect }: Props) {
  const [selectedId, setSelectedId] = useState<string>(variants[1].id); // Best Close Rate ★ default
  const [expanded, setExpanded] = useState<string | null>(variants[1].id);

  const select = (id: string) => {
    setSelectedId(id);
    setExpanded(id);
    onSelect?.(id);
  };

  return (
    <div className="flex flex-col gap-3">
      {variants.map((v) => {
        const isSelected = selectedId === v.id;
        const isExpanded = expanded === v.id;
        const isRecommended = v.label === "Best Close Rate";

        return (
          <article
            key={v.id}
            tabIndex={0}
            role="button"
            aria-pressed={isSelected}
            onClick={() => select(v.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(v.id);
              }
            }}
            className={`relative cursor-pointer rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-[#3DAEFF]/40 ${
              isSelected
                ? "border-[#3DAEFF] bg-[#12161C]"
                : "border-[#2A3038] bg-[#12161C]/50 hover:border-[#3DAEFF]/40"
            }`}
          >
            {/* Header */}
            <header className="flex items-start justify-between px-5 pt-4 pb-2">
              <div className="flex items-center gap-2">
                {isRecommended && <Star size={12} className="text-[#3DAEFF] fill-[#3DAEFF]" />}
                <span className={`text-[10px] uppercase tracking-wider ${isRecommended ? "text-[#3DAEFF]" : "text-[#9BA3AF]"}`}>
                  {v.label}
                  {isRecommended && " · Recommended"}
                </span>
              </div>
              {isSelected && (
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#62E6A7]">
                  <Check size={12} strokeWidth={3} /> Selected
                </span>
              )}
            </header>

            {/* Big saving number */}
            <div className="px-5 pb-2">
              <div className="text-3xl sm:text-4xl font-semibold tabular-nums">
                €{v.monthlySavingsEur.toLocaleString()}
                <span className="text-base text-[#9BA3AF] font-normal"> / month saved</span>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-2 px-5 py-3 border-y border-[#1A1F2A]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">System</div>
                <div className="text-sm tabular-nums">{(v.bom.panels.count * v.bom.panels.wp / 1000).toFixed(1)} kWp</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">Payback</div>
                <div className="text-sm tabular-nums">{v.paybackYears} yrs</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">Total</div>
                <div className="text-sm tabular-nums">€{v.bom.totalEur.toLocaleString()}</div>
              </div>
            </div>

            {/* Component dots */}
            <div className="flex items-center gap-3 px-5 py-3 text-xs text-[#9BA3AF]">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-md bg-[#62E6A7]" /> PV
              </span>
              {v.bom.battery && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-md bg-[#62E6A7]" /> {v.bom.battery.kwh} kWh
                </span>
              )}
              {v.bom.heatPump && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-md bg-[#F2B84B]" /> Heat pump
                </span>
              )}
              {v.bom.wallbox && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-md bg-[#62E6A7]" /> Wallbox
                </span>
              )}
            </div>

            {/* Expanded "Why this wins" */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-[#1A1F2A] pt-4 space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#5B6470] mb-1">Bill of materials</div>
                  <div className="text-xs text-[#F7F8FA] space-y-0.5">
                    <div>{v.bom.panels.brand} {v.bom.panels.model} ×{v.bom.panels.count}</div>
                    <div>{v.bom.inverter.brand} {v.bom.inverter.model}</div>
                    {v.bom.battery && <div>{v.bom.battery.brand} {v.bom.battery.model} · {v.bom.battery.kwh} kWh</div>}
                    {v.bom.heatPump && <div>{v.bom.heatPump.brand} {v.bom.heatPump.model} · {v.bom.heatPump.kw} kW</div>}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#5B6470] mb-1">Why this wins</div>
                  <div className="text-xs text-[#9BA3AF] leading-relaxed">{v.objection}</div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#5B6470] mb-1.5">Cited Reonic projects</div>
                  <div className="flex gap-2">
                    {v.citedProjectIds.map((pid) => (
                      <span key={pid} className="rounded border border-[#2A3038] bg-[#0A0E1A] px-2 py-0.5 text-[11px] text-[#9BA3AF]">
                        #{pid.replace("P-", "")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-1 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">Margin</div>
                    <div className="text-sm tabular-nums">{v.marginPct}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">Win rate</div>
                    <div className="text-sm tabular-nums">{v.winRatePct}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">Confidence</div>
                    <div className="text-sm tabular-nums">{Math.round(v.confidence * 100)}%</div>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
