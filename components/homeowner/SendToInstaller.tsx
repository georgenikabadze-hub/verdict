"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import type { Goal, Heating, Preference, RoofSegment } from "@/lib/contracts";

interface Props {
  address: string;
  coords: { lat: number; lng: number };
  intake: {
    monthlyBillEur: number;
    annualKwh?: number;
    ev: boolean;
    /** Three-state EV preference (new homeowner UI). */
    evPref?: Preference;
    /** Three-state battery preference (new homeowner UI). */
    wantsBattery?: Preference;
    /** Three-state heat pump preference (new homeowner UI). */
    wantsHeatPump?: Preference;
    heating: Heating;
    goal: Goal;
  };
  roofSegments: RoofSegment[];
}

export function SendToInstaller({ address, coords, intake, roofSegments }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setError(null);
    const nextLeadId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Pull the homeowner's voice memo (recorded via Gradium-powered
    // VoiceMemoRecorder on the intake page) out of sessionStorage if it's
    // there, and clear it once we're about to ship — no leftovers in the
    // tab between submissions.
    let voiceNote: { audioDataUrl: string; transcript?: string; durationMs?: number } | undefined;
    try {
      const raw = window.sessionStorage.getItem("verdict.pendingVoiceMemo");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.audioDataUrl === "string") {
          voiceNote = parsed;
        }
        window.sessionStorage.removeItem("verdict.pendingVoiceMemo");
      }
    } catch {
      // ignore — sessionStorage absent or quota issues
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: nextLeadId,
          address,
          lat: coords.lat,
          lng: coords.lng,
          monthlyBillEur: intake.monthlyBillEur,
          annualKwh: intake.annualKwh,
          ev: intake.ev,
          evPref: intake.evPref,
          wantsBattery: intake.wantsBattery,
          wantsHeatPump: intake.wantsHeatPump,
          heating: intake.heating,
          goal: intake.goal,
          roofSegments,
          voiceNote,
        }),
      });

      if (res.status !== 201) {
        throw new Error(`Lead POST failed with status ${res.status}`);
      }

      window.localStorage.setItem("verdict.lastLeadId", nextLeadId);
      setLeadId(nextLeadId);
      setState("sent");
    } catch (err) {
      console.error(err);
      setError("Couldn't reach our installers. Try again.");
      setState("idle");
    }
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
            Berlin Solar Pro will review your proposal. We&rsquo;ll notify you within 24 hours.
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
      {error ? (
        <p className="text-xs text-[#F2B84B] text-center">{error}</p>
      ) : null}
    </div>
  );
}
