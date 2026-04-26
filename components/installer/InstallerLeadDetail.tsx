"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Mail, MapPin, Phone, RefreshCw, Send } from "lucide-react";
import type { BoM } from "@/lib/contracts";
import type { LeadRecord } from "@/lib/leads/store";
import { CesiumRoofView } from "@/components/homeowner/CesiumRoofView";
import { PanelLayoutPreview } from "@/components/installer/PanelLayoutPreview";

interface Props {
  lead: LeadRecord;
  onLeadChange: (lead: LeadRecord) => void;
}

function formatTime(iso?: string): string {
  if (!iso) return "just now";
  return new Intl.DateTimeFormat("en-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function bomLines(bom: BoM): { label: string; value: string }[] {
  const lines = [
    {
      label: "Panels",
      value: `${bom.panels.brand} ${bom.panels.model} x${bom.panels.count} · ${(
        (bom.panels.count * bom.panels.wp) /
        1000
      ).toFixed(1)} kWp`,
    },
    {
      label: "Inverter",
      value: `${bom.inverter.brand} ${bom.inverter.model} · ${bom.inverter.kw} kW`,
    },
  ];
  if (bom.battery) {
    lines.push({
      label: "Battery",
      value: `${bom.battery.brand} ${bom.battery.model} · ${bom.battery.kwh} kWh`,
    });
  }
  if (bom.wallbox) {
    lines.push({
      label: "Wallbox",
      value: `${bom.wallbox.brand} ${bom.wallbox.model} · ${bom.wallbox.kw} kW`,
    });
  }
  if (bom.heatPump) {
    lines.push({
      label: "Heat pump",
      value: `${bom.heatPump.brand} ${bom.heatPump.model} · ${bom.heatPump.kw} kW`,
    });
  }
  return lines;
}

export function InstallerLeadDetail({ lead, onLeadChange }: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState(lead.publicPreview.bomVariants[1]?.id);
  const [busy, setBusy] = useState<"accept" | "offer" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const unlocked = lead.status !== "new";
  const selectedVariant =
    lead.publicPreview.bomVariants.find((variant) => variant.id === selectedVariantId) ??
    lead.publicPreview.bomVariants[1] ??
    lead.publicPreview.bomVariants[0];
  const lines = useMemo(() => bomLines(selectedVariant.bom), [selectedVariant.bom]);

  const acceptLead = async () => {
    setBusy("accept");
    setNotice(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptedByInstallerId: "berlin-solar-pro",
          installerName: "Berlin Solar Pro",
          installerLogoEmoji: "☀",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "accept failed");
      onLeadChange(data.lead);
      setNotice("Customer details unlocked.");
    } catch {
      setNotice("Accept failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const sendOffer = async () => {
    setBusy("offer");
    setNotice(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom: selectedVariant.bom,
          totalEur: selectedVariant.bom.totalEur,
          installerNotes: "Installer-verified BoM based on Verdict roof sizing.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "offer failed");
      onLeadChange(data.lead);
      setNotice("Offer sent. Homeowner notification is live.");
    } catch {
      setNotice("Offer failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(320px,45vh)_1fr] bg-[#0A0E1A]">
      <section className="relative overflow-hidden border-b border-[#2A3038] bg-[#0A0E1A]">
        <CesiumRoofView
          coords={{ lat: lead.privateDetails.lat, lng: lead.privateDetails.lng }}
          address={unlocked ? lead.privateDetails.address : lead.publicPreview.district}
        />
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-[#F7F8FA]">{lead.publicPreview.district}</div>
          <div className="mt-0.5 text-[#9BA3AF]">Exact rooftop model · customer details gated</div>
        </div>
      </section>

      <section className="grid gap-5 overflow-y-auto p-5 xl:grid-cols-[1fr_380px] xl:p-6">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Roof area", value: `${lead.publicPreview.roofFacts.totalAreaM2 ?? 0} m²` },
              { label: "Pitch", value: `${lead.publicPreview.roofFacts.pitchDeg ?? "—"}°` },
              { label: "Panels", value: `${lead.publicPreview.sizing.panelCount}` },
              { label: "System", value: `${lead.publicPreview.sizing.systemKwp} kWp` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-[#2A3038] bg-[#12161C] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#5B6470]">{kpi.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[#F7F8FA]">{kpi.value}</div>
              </div>
            ))}
          </div>

          <section className="rounded-lg border border-[#2A3038] bg-[#12161C] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9BA3AF]">
                AI-recommended BoM
              </h2>
              <span className="text-lg font-semibold tabular-nums text-[#F7F8FA]">
                €{selectedVariant.bom.totalEur.toLocaleString()}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {lead.publicPreview.bomVariants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    variant.id === selectedVariant.id
                      ? "border-[#3DAEFF] bg-[#3DAEFF]/10"
                      : "border-[#2A3038] bg-[#0A0E1A] hover:border-[#3DAEFF]/50"
                  }`}
                >
                  <div className="text-sm font-semibold text-[#F7F8FA]">{variant.label}</div>
                  <div className="mt-1 text-xs text-[#9BA3AF]">
                    €{variant.monthlySavingsEur}/mo · {variant.paybackYears} yrs
                  </div>
                  <div className="mt-2 text-[11px] text-[#5B6470]">
                    {variant.marginPct}% margin · {variant.winRatePct}% win
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 divide-y divide-[#2A3038] rounded-lg border border-[#2A3038] bg-[#0A0E1A]">
              {lines.map((line) => (
                <div key={line.label} className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-wider text-[#9BA3AF]">{line.label}</span>
                  <span className="text-right text-sm text-[#F7F8FA]">{line.value}</span>
                </div>
              ))}
            </div>
          </section>

          <PanelLayoutPreview
            segments={lead.publicPreview.sizing.roofSegments}
            panelCount={selectedVariant.bom.panels.count}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-[#2A3038] bg-[#12161C] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9BA3AF]">
                Customer details
              </h2>
              {unlocked ? (
                <span className="rounded-md border border-[#62E6A7]/30 bg-[#62E6A7]/10 px-2 py-1 text-[11px] text-[#62E6A7]">
                  Unlocked at {formatTime(lead.privateDetails.unlockedAt)}
                </span>
              ) : null}
            </div>

            {!unlocked ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-[#2A3038] bg-[#0A0E1A] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#F7F8FA]">
                    <Lock size={15} className="text-[#F2B84B]" />
                    Customer details hidden until you accept this lead
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-sm text-[#9BA3AF]">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-[#3DAEFF]" />
                    <span>{lead.publicPreview.district} (approx. 500m radius)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={acceptLead}
                  disabled={busy === "accept"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3DAEFF] px-4 py-3 text-sm font-semibold text-[#0A0E1A] transition-colors hover:bg-[#2EA1F0] disabled:cursor-wait disabled:opacity-60"
                >
                  {busy === "accept" ? <RefreshCw size={15} className="animate-spin" /> : <Check size={16} />}
                  Accept this lead
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-[#2A3038] bg-[#0A0E1A] p-4">
                  <div className="text-base font-semibold text-[#F7F8FA]">
                    {lead.privateDetails.customerName ?? "Homeowner"}
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-sm text-[#9BA3AF]">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-[#3DAEFF]" />
                    <span>{lead.privateDetails.address}</span>
                  </div>
                  {lead.privateDetails.email ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-[#9BA3AF]">
                      <Mail size={14} className="text-[#3DAEFF]" />
                      <span>{lead.privateDetails.email}</span>
                    </div>
                  ) : null}
                  {lead.privateDetails.phone ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-[#9BA3AF]">
                      <Phone size={14} className="text-[#3DAEFF]" />
                      <span>{lead.privateDetails.phone}</span>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={sendOffer}
                  disabled={busy === "offer"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#62E6A7] px-4 py-3 text-sm font-semibold text-[#0A0E1A] transition-colors hover:bg-[#52D495] disabled:cursor-wait disabled:opacity-60"
                >
                  {busy === "offer" ? <RefreshCw size={15} className="animate-spin" /> : <Send size={16} />}
                  Send offer
                </button>
              </div>
            )}

            {notice ? <div className="mt-3 text-xs text-[#9BA3AF]">{notice}</div> : null}
          </section>
        </aside>
      </section>
    </div>
  );
}
