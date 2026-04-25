"use client";

import { useState } from "react";
import type { Heating, Goal } from "@/lib/contracts";
import { tryParseCoords } from "@/lib/parse-coords";

const HEATING_OPTIONS: { value: Heating; label: string; emoji: string }[] = [
  { value: "gas", label: "Gas", emoji: "🔥" },
  { value: "oil", label: "Oil", emoji: "🛢" },
  { value: "heat_pump", label: "Heat pump", emoji: "♻︎" },
  { value: "district", label: "District", emoji: "🏘" },
];

const GOAL_OPTIONS: { value: Goal; label: string; sub: string }[] = [
  { value: "lower_bill", label: "Lower my bill", sub: "Maximise ROI" },
  { value: "independence", label: "Become independent", sub: "Maximise autarky" },
];

interface Props {
  onLocate?: (coords: { lat: number; lng: number }, address: string) => void;
}

export function IntakePanel({ onLocate }: Props = {}) {
  const [address, setAddress] = useState("");
  const [bill, setBill] = useState(120);
  const [ev, setEv] = useState(false);
  const [heating, setHeating] = useState<Heating>("gas");
  const [goal, setGoal] = useState<Goal>("lower_bill");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const useMyLocation = () => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Your browser doesn't support geolocation.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/reverse-geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
          );
          const data = await res.json();
          if (data.address) {
            setAddress(data.address);
            onLocate?.({ lat: data.lat, lng: data.lng }, data.address);
          } else {
            setLocationError(data.error ?? "Couldn't find an address near you.");
          }
        } catch {
          setLocationError("Couldn't reach the geocoding service.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — type your address instead."
            : "Couldn't get your location. Try typing your address.",
        );
      },
      { enableHighAccuracy: true, timeout: 7_000, maximumAge: 60_000 },
    );
  };

  const forwardGeocode = async (q: string) => {
    if (q.trim().length < 4) return;

    // Direct coords path (decimal + DMS + many formats) — skip geocoding entirely
    const parsed = tryParseCoords(q);
    if (parsed) {
      onLocate?.({ lat: parsed.lat, lng: parsed.lng }, parsed.formatted);
      return;
    }

    try {
      const res = await fetch(`/api/forward-geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (typeof data.lat === "number" && typeof data.lng === "number") {
        onLocate?.({ lat: data.lat, lng: data.lng }, data.address);
      }
    } catch {
      // silent fail — input still works for the user
    }
  };

  const onAddressBlur = () => {
    if (address.trim().length >= 5) forwardGeocode(address);
  };

  const submit = () => {
    const params = new URLSearchParams({
      address,
      bill: String(bill),
      ev: String(ev),
      heating,
      goal,
    });
    window.location.href = `/quote?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hero copy — compact */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-2xl lg:text-[26px] font-semibold leading-tight tracking-tight">
          Your home can earn more than you&rsquo;re losing on energy.
        </h1>
        <p className="text-xs sm:text-sm text-[#9BA3AF]">
          Based on 1,277 real Reonic projects.
        </p>
      </div>

      {/* Address */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">
          Address
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onBlur={onAddressBlur}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder="Enter address or lat,lng..."
          autoComplete="off"
          className="w-full rounded-lg border border-[#2A3038] bg-[#12161C] px-4 py-2.5 text-sm text-[#F7F8FA] placeholder:text-[#5B6470] focus:outline-none focus:border-[#3DAEFF] focus:ring-2 focus:ring-[#3DAEFF]/30 transition-all"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="self-start text-xs text-[#9BA3AF] hover:text-[#3DAEFF] transition-colors disabled:cursor-wait disabled:text-[#5B6470]"
        >
          {locating ? "⌖ Locating..." : "⌖ Use my location"}
        </button>
        {locationError && (
          <p className="text-[11px] text-[#F2B84B]">{locationError}</p>
        )}
      </div>

      {/* Bill slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="bill" className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">
            Electricity bill / month
          </label>
          <span className="text-base font-semibold tabular-nums text-[#F7F8FA]">€{bill}</span>
        </div>
        <input
          id="bill"
          type="range"
          min={40}
          max={500}
          step={10}
          value={bill}
          onChange={(e) => setBill(Number(e.target.value))}
          className="accent-[#3DAEFF]"
        />
      </div>

      {/* EV */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">Electric vehicle</span>
        <div className="flex rounded-lg border border-[#2A3038] overflow-hidden">
          <button
            type="button"
            onClick={() => setEv(false)}
            className={`px-3 py-1.5 text-xs transition-colors ${!ev ? "bg-[#12161C] text-[#F7F8FA]" : "text-[#9BA3AF] hover:text-[#F7F8FA]"}`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => setEv(true)}
            className={`px-3 py-1.5 text-xs transition-colors ${ev ? "bg-[#3DAEFF] text-[#0A0E1A]" : "text-[#9BA3AF] hover:text-[#F7F8FA]"}`}
          >
            Yes
          </button>
        </div>
      </div>

      {/* Heating segmented */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-[#9BA3AF]">Heating system</span>
        <div className="grid grid-cols-4 gap-2">
          {HEATING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setHeating(opt.value)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition-all ${
                heating === opt.value
                  ? "border-[#3DAEFF] bg-[#3DAEFF]/10 text-[#F7F8FA]"
                  : "border-[#2A3038] bg-[#12161C] text-[#9BA3AF] hover:border-[#3DAEFF]/50"
              }`}
            >
              <span className="text-base">{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Goal */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-[#9BA3AF]">Your goal</span>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGoal(opt.value)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-all ${
                goal === opt.value
                  ? "border-[#3DAEFF] bg-[#3DAEFF]/10"
                  : "border-[#2A3038] bg-[#12161C] hover:border-[#3DAEFF]/50"
              }`}
            >
              <span className={`text-sm ${goal === opt.value ? "text-[#F7F8FA]" : "text-[#9BA3AF]"}`}>
                {opt.label}
              </span>
              <span className="text-[10px] text-[#5B6470]">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={submit}
        disabled={!address.trim()}
        className="mt-2 w-full rounded-lg bg-[#3DAEFF] px-5 py-4 text-base font-semibold text-[#0A0E1A] transition-all hover:bg-[#2EA1F0] disabled:bg-[#1F3A52] disabled:text-[#5B6470] disabled:cursor-not-allowed"
      >
        See my Verdict →
      </button>

      <p className="text-[11px] text-[#5B6470] text-center">
        non-binding · no phone call · the installer reviews your Verdict and quotes within 24h
      </p>
    </div>
  );
}
