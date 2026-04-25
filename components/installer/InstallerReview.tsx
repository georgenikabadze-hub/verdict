"use client";

import { useState } from "react";
import { Pencil, RefreshCw, Check } from "lucide-react";

type BomLine = { label: string; value: string };

interface MockVariant {
  id: string;
  customerName: string;
  city: string;
  totalEur: number;
  monthlySavingsEur: number;
  paybackYears: number;
  marginPct: number;
  winRatePct: number;
  confidence: number;
  bomLines: BomLine[];
  citedProjectIds: string[];
}

const INITIAL: MockVariant = {
  id: "lead-conrad-001",
  customerName: "Conrad Smith",
  city: "Hamburg",
  totalEur: 22100,
  monthlySavingsEur: 142,
  paybackYears: 8.8,
  marginPct: 29,
  winRatePct: 72,
  confidence: 0.86,
  bomLines: [
    { label: "Panels",   value: "Huawei LR7 ×24 · 11.4 kWp" },
    { label: "Inverter", value: "Huawei SUN2000-10KTL" },
    { label: "Battery",  value: "EcoFlow 9 kWh" },
    { label: "Mount",    value: "Schletter K2" },
  ],
  citedProjectIds: ["#882", "#1041", "#1198"],
};

function jitter(n: number, pct: number) {
  const delta = n * (Math.random() * 2 - 1) * pct;
  return n + delta;
}

export function InstallerReview() {
  const [v, setV] = useState<MockVariant>(INITIAL);
  const [approved, setApproved] = useState(false);

  const recalc = () => {
    setV((prev) => ({
      ...prev,
      totalEur:          Math.round(jitter(prev.totalEur, 0.04)),
      monthlySavingsEur: Math.round(jitter(prev.monthlySavingsEur, 0.08)),
      paybackYears:      +jitter(prev.paybackYears, 0.06).toFixed(1),
      marginPct:         Math.round(jitter(prev.marginPct, 0.05)),
      confidence:        +Math.min(0.99, jitter(prev.confidence, 0.04)).toFixed(2),
    }));
  };

  if (approved) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-16">
        <div className="rounded-full bg-[#62E6A7]/15 p-4">
          <Check size={36} className="text-[#62E6A7]" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-semibold">Approved &middot; homeowner notified</h2>
        <p className="text-sm text-[#9BA3AF] max-w-md">
          {v.customerName} just got a push notification with the final BoM. Verdict link:{" "}
          <code className="text-[#3DAEFF]">verdict.app/v/{v.id}</code>
        </p>
        <button
          type="button"
          onClick={() => { setV(INITIAL); setApproved(false); }}
          className="mt-2 text-xs text-[#5B6470] hover:text-[#9BA3AF]"
        >
          ← back to inbox
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Lead header */}
      <div className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-[#9BA3AF]">Verdict pre-qualified lead</span>
          <h2 className="text-2xl font-semibold mt-1">{v.customerName} <span className="text-[#9BA3AF] font-normal">· {v.city}</span></h2>
        </div>
        <span className="text-2xl font-semibold tabular-nums">€{v.totalEur.toLocaleString()}</span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Monthly saving", value: `€${v.monthlySavingsEur}` },
          { label: "Payback",        value: `${v.paybackYears} yrs` },
          { label: "Margin",         value: `${v.marginPct}%` },
          { label: "Confidence",     value: `${Math.round(v.confidence * 100)}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-[#2A3038] bg-[#12161C] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">{kpi.label}</div>
            <div className="text-base font-semibold tabular-nums mt-1">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Editable BoM table */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-[#9BA3AF]">Bill of Materials</span>
        <div className="rounded-lg border border-[#2A3038] bg-[#12161C] divide-y divide-[#1A1F2A]">
          {v.bomLines.map((line) => (
            <div key={line.label} className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-[#5B6470]">{line.label}</span>
                <span className="text-sm">{line.value}</span>
              </div>
              <button
                type="button"
                aria-label={`Edit ${line.label}`}
                className="rounded-md p-1.5 text-[#5B6470] hover:bg-[#1A1F2A] hover:text-[#3DAEFF] transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Cited projects */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-[#9BA3AF]">Cited Reonic projects</span>
        <div className="flex gap-2">
          {v.citedProjectIds.map((pid) => (
            <span
              key={pid}
              className="rounded-md border border-[#2A3038] bg-[#12161C] px-2.5 py-1 text-xs text-[#9BA3AF]"
            >
              {pid}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-2">
        <button
          type="button"
          onClick={recalc}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-[#2A3038] bg-[#12161C] px-5 py-3 text-sm font-medium text-[#F7F8FA] hover:border-[#3DAEFF]/50 transition-colors"
        >
          <RefreshCw size={14} /> Recalculate
        </button>
        <button
          type="button"
          onClick={() => setApproved(true)}
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#3DAEFF] px-5 py-3 text-sm font-semibold text-[#0A0E1A] hover:bg-[#2EA1F0] transition-colors"
        >
          <Check size={16} strokeWidth={3} /> Approve and send
        </button>
      </div>
    </div>
  );
}
