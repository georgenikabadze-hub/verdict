"use client";

import { useState } from "react";
import type { Preference } from "@/lib/contracts";
import { tryParseCoords } from "@/lib/parse-coords";
import { AddressAutocomplete } from "./AddressAutocomplete";

type ConsumptionMode = "kwh" | "bill";

const PREF_OPTIONS: { value: Preference; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "idk", label: "Not sure" },
];

interface Props {
  onLocate?: (coords: { lat: number; lng: number }, address: string) => void;
}

export function IntakePanel({ onLocate }: Props = {}) {
  const [address, setAddress] = useState("");
  const [consumptionMode, setConsumptionMode] = useState<ConsumptionMode>("bill");
  const [annualKwh, setAnnualKwh] = useState<string>("");
  const [annualBill, setMonthlyBill] = useState<string>("");
  const [wantsBattery, setWantsBattery] = useState<Preference>("idk");
  const [wantsHeatPump, setWantsHeatPump] = useState<Preference>("idk");
  const [evPref, setEvPref] = useState<Preference>("idk");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

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

    setResolving(true);
    try {
      const res = await fetch(`/api/forward-geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (typeof data.lat === "number" && typeof data.lng === "number") {
        onLocate?.({ lat: data.lat, lng: data.lng }, data.address);
      }
    } catch {
      // silent fail — input still works for the user
    } finally {
      setResolving(false);
    }
  };

  const onAddressBlur = () => {
    if (address.trim().length >= 5) forwardGeocode(address);
  };

  /**
   * Called on every keystroke. Coord-bypass MUST run here so pasting
   * "52.5, 13.4" snaps to the map without waiting for Places to suggest
   * (Places can't autocomplete numeric coords anyway).
   */
  const onAddressChange = (next: string) => {
    setAddress(next);
    const parsed = tryParseCoords(next);
    if (parsed) {
      onLocate?.({ lat: parsed.lat, lng: parsed.lng }, parsed.formatted);
    }
  };

  // Validation: address + at least one consumption value (the active mode's value)
  const consumptionFilled =
    consumptionMode === "kwh"
      ? Number(annualKwh) > 0
      : Number(annualBill) > 0;
  const canSubmit = address.trim().length > 0 && consumptionFilled;

  // Both inputs are now per-year. Derive monthly bill (legacy field) by /12 when in bill mode,
  // or from annualKwh × 0.32 / 12 when in kWh mode.

  const submit = () => {
    if (!canSubmit) return;
    // Internally still set heating + goal (defaults) — lib/contracts.ts requires them.
    // Translate consumption mode → annualBillEur (always send a numeric bill).
    // If the user picked kWh, derive a synthetic monthly bill from annualKwh × 0.32 / 12
    // so the legacy field is populated; the new annualKwh field is also passed through.
    const derivedMonthlyBill =
      consumptionMode === "bill"
        ? Math.round(Number(annualBill) / 12)
        : Math.round((Number(annualKwh) * 0.32) / 12);
    const params = new URLSearchParams({
      address,
      bill: String(derivedMonthlyBill || 120),
      ev: String(evPref === "yes"),
      heating: "gas",
      goal: "lower_bill",
      evPref,
      wantsBattery,
      wantsHeatPump,
    });
    if (consumptionMode === "kwh" && Number(annualKwh) > 0) {
      params.set("annualKwh", String(Number(annualKwh)));
    }
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
        <AddressAutocomplete
          id="address"
          value={address}
          onChange={onAddressChange}
          onPlaceSelected={(coords, formatted) => {
            setAddress(formatted);
            onLocate?.(coords, formatted);
          }}
          onBlur={onAddressBlur}
          placeholder="Enter address or lat,lng..."
          autoComplete="off"
          className="w-full rounded-lg border border-[#2A3038] bg-[#12161C] px-4 py-2.5 text-sm text-[#F7F8FA] placeholder:text-[#5B6470] focus:outline-none focus:border-[#3DAEFF] focus:ring-2 focus:ring-[#3DAEFF]/30 transition-all"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="text-xs text-[#9BA3AF] hover:text-[#3DAEFF] transition-colors disabled:cursor-wait disabled:text-[#5B6470]"
          >
            {locating ? "⌖ Locating..." : "⌖ Use my location"}
          </button>
          {resolving && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#9BA3AF]">
              <span className="inline-block h-2.5 w-2.5 rounded-md border-2 border-[#3DAEFF]/30 border-t-[#3DAEFF] animate-spin" />
              Resolving address…
            </span>
          )}
        </div>
        {locationError && (
          <p className="text-[11px] text-[#F2B84B]">{locationError}</p>
        )}
      </div>

      {/* Consumption — toggle between kWh/year OR monthly bill (€) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">
            Consumption
          </span>
          <div
            role="radiogroup"
            aria-label="Consumption input mode"
            className="flex rounded-lg border border-[#2A3038] overflow-hidden"
          >
            <button
              type="button"
              role="radio"
              aria-checked={consumptionMode === "bill"}
              onClick={() => setConsumptionMode("bill")}
              className={`px-3 py-1 text-[11px] transition-colors ${
                consumptionMode === "bill"
                  ? "bg-[#3DAEFF] text-[#0A0E1A]"
                  : "text-[#9BA3AF] hover:text-[#F7F8FA]"
              }`}
            >
              € / year
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={consumptionMode === "kwh"}
              onClick={() => setConsumptionMode("kwh")}
              className={`px-3 py-1 text-[11px] transition-colors ${
                consumptionMode === "kwh"
                  ? "bg-[#3DAEFF] text-[#0A0E1A]"
                  : "text-[#9BA3AF] hover:text-[#F7F8FA]"
              }`}
            >
              kWh / year
            </button>
          </div>
        </div>

        {consumptionMode === "bill" ? (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#5B6470]">
              €
            </span>
            <input
              id="bill"
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={annualBill}
              onChange={(e) => setMonthlyBill(e.target.value)}
              placeholder="120"
              className="w-full rounded-lg border border-[#2A3038] bg-[#12161C] pl-7 pr-16 py-2.5 text-sm text-[#F7F8FA] placeholder:text-[#5B6470] focus:outline-none focus:border-[#3DAEFF] focus:ring-2 focus:ring-[#3DAEFF]/30 transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#5B6470]">
              / month
            </span>
          </div>
        ) : (
          <div className="relative">
            <input
              id="kwh"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={annualKwh}
              onChange={(e) => setAnnualKwh(e.target.value)}
              placeholder="4500"
              className="w-full rounded-lg border border-[#2A3038] bg-[#12161C] px-3 pr-20 py-2.5 text-sm text-[#F7F8FA] placeholder:text-[#5B6470] focus:outline-none focus:border-[#3DAEFF] focus:ring-2 focus:ring-[#3DAEFF]/30 transition-all"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#5B6470]">
              kWh / yr
            </span>
          </div>
        )}
      </div>

      {/* Three preference fields: battery, heat pump, EV */}
      <ThreeStateRow
        label="Battery?"
        value={wantsBattery}
        onChange={setWantsBattery}
        groupName="battery"
      />
      <ThreeStateRow
        label="Heat pump?"
        value={wantsHeatPump}
        onChange={setWantsHeatPump}
        groupName="heatpump"
      />
      <ThreeStateRow
        label="EV charger?"
        value={evPref}
        onChange={setEvPref}
        groupName="ev"
      />

      {/* CTA */}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
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

interface ThreeStateRowProps {
  label: string;
  value: Preference;
  onChange: (v: Preference) => void;
  groupName: string;
}

function ThreeStateRow({ label, value, onChange, groupName }: ThreeStateRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-lg border border-[#2A3038] overflow-hidden"
      >
        {PREF_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              name={groupName}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#3DAEFF]/40 focus:relative ${
                active
                  ? "bg-[#3DAEFF] text-[#0A0E1A]"
                  : "text-[#9BA3AF] hover:text-[#F7F8FA]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
