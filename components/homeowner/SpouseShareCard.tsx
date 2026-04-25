"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";

interface Props {
  monthlySavingsEur: number;
  paybackYears: number;
  systemKwp: number;
  address: string;
}

export function SpouseShareCard({
  monthlySavingsEur,
  paybackYears,
  systemKwp,
  address,
}: Props) {
  const [copied, setCopied] = useState(false);

  const message = `Honey, our roof is losing about €${monthlySavingsEur} every month.\n\n${systemKwp} kWp · ${paybackYears} year payback · installer-ready in 60 seconds.\n\nverdict.app`;

  const shareNative = async () => {
    if (typeof navigator === "undefined") return;
    if ("share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: "Verdict — your roof's annual report",
          text: message,
        });
      } catch {
        // user cancelled or share failed silently
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // older browser — silent fail
    }
  };

  return (
    <div className="rounded-xl border border-[#3DAEFF]/30 bg-gradient-to-br from-[#0A0E1A] to-[#12161C] p-5 sm:p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#3DAEFF]">Spouse-share card</span>
        <span className="text-[10px] text-[#5B6470]">share to convince at home</span>
      </header>

      {/* The shareable quote */}
      <blockquote className="border-l-2 border-[#3DAEFF] pl-4 py-1">
        <p className="text-base sm:text-lg font-medium leading-snug text-[#F7F8FA]">
          &ldquo;Honey, our roof is losing about{" "}
          <span className="text-[#62E6A7] tabular-nums">€{monthlySavingsEur}</span>{" "}
          every month.&rdquo;
        </p>
      </blockquote>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3 border-y border-[#1A1F2A] py-3">
        <Stat label="System" value={`${systemKwp} kWp`} />
        <Stat label="Payback" value={`${paybackYears} yrs`} />
        <Stat label="Ready in" value="60 sec" />
      </div>

      {/* Address footer */}
      <p className="text-[11px] text-[#9BA3AF] truncate">📍 {address}</p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={shareNative}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#3DAEFF] px-4 py-2.5 text-sm font-semibold text-[#0A0E1A] hover:bg-[#2EA1F0] transition-colors"
        >
          <Share2 size={14} /> Share with spouse
        </button>
        <button
          type="button"
          onClick={copyToClipboard}
          aria-label="Copy to clipboard"
          className="flex items-center justify-center gap-2 rounded-lg border border-[#2A3038] bg-[#12161C] px-4 py-2.5 text-sm text-[#F7F8FA] hover:border-[#3DAEFF]/50 transition-colors"
        >
          {copied ? <Check size={14} className="text-[#62E6A7]" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-[#9BA3AF]">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-[#F7F8FA] mt-0.5">{value}</span>
    </div>
  );
}
