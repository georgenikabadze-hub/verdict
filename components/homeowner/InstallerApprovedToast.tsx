"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

interface LeadShape {
  id: string;
  status: "new" | "approved";
  installerName?: string;
  installerLogoEmoji?: string;
  totalEur: number;
  monthlySavingsEur: number;
  paybackYears: number;
  finalBom?: { label: string; value: string }[];
  approvedAt?: string;
}

const POLL_INTERVAL_MS = 2_000;
const DEMO_LEAD_ID = "demo-conrad";

export function InstallerApprovedToast() {
  const [lead, setLead] = useState<LeadShape | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/leads/${DEMO_LEAD_ID}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.lead?.status === "approved") {
          setLead(data.lead);
        }
      } catch {
        // silent — keep polling
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!lead || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-xl border border-[#62E6A7]/40 bg-[#0A0E1A]/95 backdrop-blur shadow-2xl shadow-black/40 p-5 flex flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[#62E6A7]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#62E6A7]">
              Your Verdict has been finalized
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-[#5B6470] hover:text-[#F7F8FA] transition-colors"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{lead.installerLogoEmoji ?? "☀"}</span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[#F7F8FA]">{lead.installerName ?? "Müller Solartechnik"}</span>
            <span className="text-xs text-[#9BA3AF]">approved your proposal</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-[#1A1F2A] pt-3">
          <span className="text-xs text-[#9BA3AF]">Final system</span>
          <span className="text-base font-semibold tabular-nums text-[#F7F8FA]">
            €{lead.totalEur.toLocaleString()}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[#9BA3AF]">Saving / month</span>
          <span className="text-base font-semibold tabular-nums text-[#62E6A7]">
            €{lead.monthlySavingsEur}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[#9BA3AF]">Payback</span>
          <span className="text-base font-semibold tabular-nums text-[#F7F8FA]">
            {lead.paybackYears} yrs
          </span>
        </div>

        <button
          type="button"
          className="mt-1 w-full rounded-lg bg-[#3DAEFF] px-4 py-2 text-sm font-semibold text-[#0A0E1A] hover:bg-[#2EA1F0] transition-colors"
        >
          Open final proposal →
        </button>
      </div>
    </div>
  );
}
