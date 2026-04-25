"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";

interface Props {
  leadId: string;
}

export function SendToInstaller({ leadId }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const send = async () => {
    setState("sending");
    // Simulate the lead-packet POST. Real handoff arrives in Sprint 4 (Vercel KV).
    await new Promise((r) => setTimeout(r, 900));
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-[#62E6A7]/40 bg-[#12161C] p-5 sm:p-6 flex flex-col items-center text-center gap-3">
        <div className="rounded-md bg-[#62E6A7]/15 p-3">
          <Check size={28} className="text-[#62E6A7]" strokeWidth={3} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Verdict sent</h3>
          <p className="text-sm text-[#9BA3AF] mt-1">
            Müller Solartechnik will review your proposal. We&rsquo;ll notify you within 24 hours.
          </p>
        </div>
        <code className="text-[11px] text-[#5B6470]">lead {leadId}</code>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending"}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#3DAEFF] px-5 py-4 text-base font-semibold text-[#0A0E1A] transition-all hover:bg-[#2EA1F0] disabled:bg-[#1F3A52] disabled:text-[#5B6470] disabled:cursor-wait"
      >
        {state === "sending" ? (
          <>
            <span className="inline-block h-4 w-4 rounded-md border-2 border-[#0A0E1A]/30 border-t-[#0A0E1A] animate-spin" />
            Sending Verdict packet...
          </>
        ) : (
          <>
            <Send size={16} /> Send to a certified Reonic installer
          </>
        )}
      </button>
      <p className="text-[11px] text-[#5B6470] text-center">
        non-binding · no phone call · the installer receives roof measurement, demand profile, and recommended system
      </p>
    </div>
  );
}
