"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Eye, EyeOff, MapPin } from "lucide-react";
import type { LeadRecord, LeadStatus } from "@/lib/leads/store";
import { InstallerLeadDetail } from "@/components/installer/InstallerLeadDetail";

interface Props {
  initialLeads: LeadRecord[];
  mapsApiKey?: string;
}

const EXACT_VIEW_STORAGE_KEY = "verdict.installer.exactView";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(status: LeadStatus): string {
  if (status === "accepted") return "Accepted by you";
  if (status === "offer_sent") return "Offer sent";
  if (status === "closed") return "Closed";
  return "New";
}

function statusClass(status: LeadStatus): string {
  if (status === "new") return "border-[#3DAEFF]/35 bg-[#3DAEFF]/10 text-[#3DAEFF]";
  if (status === "accepted") return "border-[#62E6A7]/35 bg-[#62E6A7]/10 text-[#62E6A7]";
  return "border-[#F2B84B]/35 bg-[#F2B84B]/10 text-[#F2B84B]";
}

function staticMapUrl(lead: LeadRecord, apiKey?: string, useExact = false): string | null {
  if (!apiKey) return null;
  const sourceLat = useExact ? lead.privateDetails.lat : lead.publicPreview.blurredLat;
  const sourceLng = useExact ? lead.privateDetails.lng : lead.publicPreview.blurredLng;
  const lat = sourceLat.toFixed(6);
  const lng = sourceLng.toFixed(6);
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "14",
    size: "320x132",
    scale: "2",
    maptype: "satellite",
    key: apiKey,
  });
  params.append("markers", `color:blue|${lat},${lng}`);
  params.append("style", "feature:all|element:labels|visibility:off");
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function InstallerMarketplace({ initialLeads, mapsApiKey }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0]?.id ?? null);
  // Default to exact view: testing needs the real building visible at all times.
  // The privacy-blurred mode is still selectable via the toggle for the demo pitch.
  const [exactView, setExactView] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem(EXACT_VIEW_STORAGE_KEY);
    if (stored === "0") setExactView(false);
  }, []);
  // -----------------------------------------------------------------------
  // Refetch on mount + on tab focus.
  //
  // Why: the lead store is in-memory on `globalThis` (lib/leads/store.ts).
  // On Vercel each serverless function invocation has its OWN Map, so a
  // POST to /api/leads (which created the lead in lambda instance A) and
  // an SSR for /installer (which ran on instance B) end up looking at
  // different stores. Instance B SSRs `initialLeads: []` and the
  // marketplace appears empty even though the lead exists.
  //
  // Refetching on mount works because the API GET *also* hits whatever
  // instance has the data — and Vercel's load balancer keeps warm
  // instances stable enough that we usually hit the same one twice in a
  // row. Focus-refetch covers the homeowner-just-submitted case where
  // the installer tab was already open.
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await fetch("/api/leads", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { leads?: LeadRecord[] };
        if (cancelled) return;
        const fetched = Array.isArray(data.leads) ? data.leads : [];
        setLeads(fetched);
        // Only auto-select if nothing is selected yet — don't yank the
        // installer off the lead they were already inspecting.
        setSelectedId((prev) => prev ?? fetched[0]?.id ?? null);
      } catch {
        // Network blip — keep the existing list. Next focus event retries.
      }
    };
    refetch();
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const toggleExactView = () => {
    setExactView((prev) => {
      const next = !prev;
      window.localStorage.setItem(EXACT_VIEW_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };
  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedId) ?? null,
    [leads, selectedId],
  );
  const newCount = leads.filter((lead) => lead.status === "new").length;

  const updateLead = (updated: LeadRecord) => {
    setLeads((prev) => prev.map((lead) => (lead.id === updated.id ? updated : lead)));
    setSelectedId(updated.id);
  };

  return (
    <main className="flex min-h-dvh flex-col bg-[#0A0E1A] text-[#F7F8FA]">
      <header className="flex items-center justify-between border-b border-[#2A3038] px-5 py-4 sm:px-6">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold tracking-tight">Berlin Solar Pro</span>
          <span className="text-xs text-[#9BA3AF]">Lead marketplace</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleExactView}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              exactView
                ? "border-[#F2B84B]/45 bg-[#F2B84B]/10 text-[#F2B84B]"
                : "border-[#2A3038] bg-[#12161C] text-[#9BA3AF] hover:text-[#F7F8FA]"
            }`}
            title={exactView ? "Showing exact coords (debug)" : "Showing blurred coords (privacy view)"}
          >
            {exactView ? <EyeOff size={12} /> : <Eye size={12} />}
            {exactView ? "Exact (debug)" : "Privacy view"}
          </button>
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[#62E6A7]" />
            <span className="text-xs text-[#9BA3AF]">{newCount} new</span>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[348px_1fr]">
        <aside className="min-h-0 border-b border-[#2A3038] bg-[#12161C] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[#2A3038] px-4 py-3">
            <h1 className="text-sm font-semibold">Qualified leads</h1>
            <span className="text-xs tabular-nums text-[#9BA3AF]">{leads.length}</span>
          </div>
          <div className="flex max-h-[42vh] flex-col gap-3 overflow-y-auto p-3 lg:max-h-[calc(100dvh-105px)]">
            {leads.map((lead) => {
              const mapUrl = staticMapUrl(lead, mapsApiKey, exactView);
              const selected = lead.id === selectedId;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className={`overflow-hidden rounded-lg border text-left transition-colors ${
                    selected
                      ? "border-[#3DAEFF] bg-[#0A0E1A]"
                      : "border-[#2A3038] bg-[#0A0E1A]/70 hover:border-[#3DAEFF]/45"
                  }`}
                >
                  <div className="relative h-28 bg-[#0A0E1A]">
                    {mapUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mapUrl} alt="" className="h-full w-full object-cover opacity-80" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#5B6470]">
                        <MapPin size={20} />
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 rounded-md border border-[#2A3038] bg-[#0A0E1A]/85 px-2 py-1 text-[11px] text-[#9BA3AF] backdrop-blur">
                      {exactView ? "Exact location · debug" : `Approx. ${lead.publicPreview.blurRadiusMeters}m radius`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#F7F8FA]">
                          {lead.publicPreview.district}
                        </div>
                        <div className="mt-0.5 text-xs text-[#9BA3AF]">{relativeTime(lead.createdAt)}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium ${statusClass(
                          lead.status,
                        )}`}
                      >
                        {statusLabel(lead.status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-[#5B6470]">Area</div>
                        <div className="mt-0.5 tabular-nums text-[#F7F8FA]">
                          {lead.publicPreview.roofFacts.totalAreaM2 ?? "—"} m²
                        </div>
                      </div>
                      <div>
                        <div className="text-[#5B6470]">Pitch</div>
                        <div className="mt-0.5 tabular-nums text-[#F7F8FA]">
                          {lead.publicPreview.roofFacts.pitchDeg ?? "—"}°
                        </div>
                      </div>
                      <div>
                        <div className="text-[#5B6470]">Panels</div>
                        <div className="mt-0.5 tabular-nums text-[#F7F8FA]">
                          {lead.publicPreview.sizing.panelCount}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {selectedLead ? (
          <InstallerLeadDetail lead={selectedLead} onLeadChange={updateLead} />
        ) : (
          <section className="flex items-center justify-center p-8 text-center text-sm text-[#9BA3AF]">
            Select a lead to review roof facts, BoM, and customer unlock status.
          </section>
        )}
      </div>
    </main>
  );
}
