"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import type { BoM, Intake, RoofSegment, Strategy, Variant } from "@/lib/contracts";
import type { LeadRecord } from "@/lib/leads/store";
import { sizeQuote, type SizingResultWithAllocations } from "@/lib/sizing/calculate";
import {
  composeFromMarket,
  type SizingResultWithMarket,
  type VariantSourceUrls,
} from "@/lib/sizing/compose-from-market";
import { CesiumRoofView } from "@/components/homeowner/CesiumRoofView";
import { PanelLayoutPreview } from "@/components/installer/PanelLayoutPreview";
import { SegmentBreakdown } from "@/components/installer/SegmentBreakdown";
import { SourceUrlChip } from "@/components/installer/SourceUrlChip";
import {
  PanelOverlayCesium,
  type SolarPanelEntry,
} from "@/components/installer/PanelOverlayCesium";

interface Props {
  lead: LeadRecord;
  onLeadChange: (lead: LeadRecord) => void;
}

interface RoofFactsResponse {
  segments?: Array<{
    pitchDegrees?: number;
    azimuthDegrees?: number;
    areaMeters2?: number;
    annualSunshineHours?: number;
    planeHeightAtCenterMeters?: number;
  }>;
  totalAreaM2?: number;
  solarPanels?: Array<{
    center: { latitude: number; longitude: number };
    orientation: "LANDSCAPE" | "PORTRAIT";
    segmentIndex: number;
    yearlyEnergyDcKwh: number;
    segmentAzimuthDegrees?: number;
    segmentHeightMeters?: number;
  }>;
}

/** Watt-peak per panel — matches lib/sizing/calculate.ts (440W modules). */
const PANEL_KWP = 0.44;

function formatTime(iso?: string): string {
  if (!iso) return "just now";
  return new Intl.DateTimeFormat("en-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface BomLine {
  label: string;
  value: string;
  sourceUrl?: string;
}

function bomLines(bom: BoM, urls?: VariantSourceUrls): BomLine[] {
  const lines: BomLine[] = [
    {
      label: "Panels",
      value: `${bom.panels.brand} ${bom.panels.model} x${bom.panels.count} · ${(
        (bom.panels.count * bom.panels.wp) /
        1000
      ).toFixed(1)} kWp`,
      sourceUrl: urls?.panel,
    },
    {
      label: "Inverter",
      value: `${bom.inverter.brand} ${bom.inverter.model} · ${bom.inverter.kw} kW`,
      sourceUrl: urls?.inverter,
    },
  ];
  if (bom.battery) {
    lines.push({
      label: "Battery",
      value: `${bom.battery.brand} ${bom.battery.model} · ${bom.battery.kwh} kWh`,
      sourceUrl: urls?.battery,
    });
  }
  if (bom.wallbox) {
    lines.push({
      label: "Wallbox",
      value: `${bom.wallbox.brand} ${bom.wallbox.model} · ${bom.wallbox.kw} kW`,
      sourceUrl: urls?.wallbox,
    });
  }
  if (bom.heatPump) {
    lines.push({
      label: "Heat pump",
      value: `${bom.heatPump.brand} ${bom.heatPump.model} · ${bom.heatPump.kw} kW`,
      sourceUrl: urls?.heatPump,
    });
  }
  if (urls?.mount) {
    lines.push({
      label: "Mount",
      value: "per-panel mounting hardware",
      sourceUrl: urls.mount,
    });
  }
  return lines;
}

type AzimuthBucket = "E" | "SE" | "S" | "SW" | "W" | "N" | "flat";

function bucketAzimuth(azimuthDegrees: number, pitchDegrees: number): AzimuthBucket {
  if (pitchDegrees < 5) return "flat";
  const a = ((azimuthDegrees % 360) + 360) % 360;
  if (a >= 157.5 && a < 202.5) return "S";
  if (a >= 112.5 && a < 157.5) return "SE";
  if (a >= 202.5 && a < 247.5) return "SW";
  if (a >= 67.5 && a < 112.5) return "E";
  if (a >= 247.5 && a < 292.5) return "W";
  return "N";
}

function dominantBucket(segments: RoofSegment[]): AzimuthBucket | null {
  if (segments.length === 0) return null;
  const counts = new Map<AzimuthBucket, number>();
  for (const s of segments) {
    const b = bucketAzimuth(s.azimuthDegrees, s.pitchDegrees);
    counts.set(b, (counts.get(b) ?? 0) + Math.max(1, s.areaMeters2));
  }
  let best: AzimuthBucket | null = null;
  let bestScore = -Infinity;
  for (const [b, score] of counts) {
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function intakeFromLead(lead: LeadRecord): Intake {
  const prefs = lead.publicPreview.preferences;
  const goal: Intake["goal"] = prefs.goal === "independent" ? "independence" : "lower_bill";
  return {
    address: lead.privateDetails.address,
    lat: lead.privateDetails.lat,
    lng: lead.privateDetails.lng,
    monthlyBillEur: prefs.monthlyBillEur,
    ev: prefs.ev,
    evPref: prefs.evPref,
    wantsBattery: prefs.wantsBattery,
    wantsHeatPump: prefs.wantsHeatPump,
    heating: prefs.heating as Intake["heating"],
    goal,
  };
}

type LiveSizing = SizingResultWithMarket & Partial<SizingResultWithAllocations>;

export function InstallerLeadDetail({ lead, onLeadChange }: Props) {
  const [liveSizing, setLiveSizing] = useState<LiveSizing | null>(null);
  const [liveTotalAreaM2, setLiveTotalAreaM2] = useState<number | null>(null);
  const [livePitchDeg, setLivePitchDeg] = useState<number | null>(null);
  const [liveSegments, setLiveSegments] = useState<RoofSegment[] | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState(false);

  // Cesium-overlay state. Viewer comes from CesiumRoofView via the
  // onViewerReady callback. solarPanels arrives from /api/roof-facts (Google's
  // per-panel placement). removedPanelKeys is the installer's manual edits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cesiumViewer, setCesiumViewer] = useState<any | null>(null);
  const [solarPanels, setSolarPanels] = useState<SolarPanelEntry[]>([]);
  const [manuallyAddedPanels, setManuallyAddedPanels] = useState<SolarPanelEntry[]>([]);
  const [removedPanelKeys, setRemovedPanelKeys] = useState<Set<string>>(new Set());
  const [showPanels, setShowPanels] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const baseVariants: Variant[] = liveSizing?.variants
    ? [...liveSizing.variants]
    : lead.publicPreview.bomVariants;

  const [selectedVariantId, setSelectedVariantId] = useState(lead.publicPreview.bomVariants[1]?.id);
  const [busy, setBusy] = useState<"accept" | "offer" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const unlocked = lead.status !== "new";

  useEffect(() => {
    let cancelled = false;
    setLiveLoading(true);
    setLiveError(false);
    // Reset overlay state when the lead identity changes — different building,
    // different panels, no carry-over removals or manual additions.
    setSolarPanels([]);
    setManuallyAddedPanels([]);
    setRemovedPanelKeys(new Set());
    setEditMode(false);

    const { lat, lng } = lead.privateDetails;
    fetch(`/api/roof-facts?lat=${lat}&lng=${lng}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("roof-facts failed");
        return res.json() as Promise<RoofFactsResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const rawSegments = Array.isArray(data.segments) ? data.segments : [];
        if (rawSegments.length === 0) {
          setLiveError(true);
          setLiveLoading(false);
          return;
        }
        const segments: RoofSegment[] = rawSegments.map((s) => ({
          pitchDegrees: s.pitchDegrees ?? 0,
          azimuthDegrees: s.azimuthDegrees ?? 180,
          areaMeters2: s.areaMeters2 ?? 0,
          annualSunshineHours: s.annualSunshineHours ?? 1000,
        }));
        const intake = intakeFromLead(lead);

        // Primary path: market-driven composer.
        // Fallback path: legacy sizeQuote so the demo never crashes.
        let sizing: LiveSizing | null = null;
        try {
          const market = composeFromMarket({ intake, roofSegments: segments });
          if (market) sizing = market as LiveSizing;
        } catch (err) {
          console.warn("composeFromMarket failed, falling back to sizeQuote", err);
        }
        if (!sizing) {
          try {
            sizing = sizeQuote(intake, segments) as LiveSizing;
          } catch (innerErr) {
            console.error("sizeQuote fallback also failed", innerErr);
          }
        }

        if (!sizing) {
          setLiveError(true);
          setLiveLoading(false);
          return;
        }

        setLiveSizing(sizing);
        setLiveSegments(segments);
        setLiveTotalAreaM2(typeof data.totalAreaM2 === "number" ? data.totalAreaM2 : null);
        setLivePitchDeg(median(segments.map((s) => s.pitchDegrees)));

        // Wire up Google's per-panel placement for the Cesium overlay. Each
        // panel inherits its segment's azimuth (rounded ints from the API) so
        // the rectangle rotates to the roof slope, AND its segment's WGS84
        // height (planeHeightAtCenterMeters) so it sits ON the roof rather
        // than at sea level. The roof-facts route now returns both directly
        // on each panel — we trust those when present, fall back to segments
        // lookup when not.
        const rawPanels = Array.isArray(data.solarPanels) ? data.solarPanels : [];
        const enriched: SolarPanelEntry[] = rawPanels.map((p) => ({
          center: { latitude: p.center.latitude, longitude: p.center.longitude },
          orientation: p.orientation,
          segmentIndex: p.segmentIndex,
          yearlyEnergyDcKwh: p.yearlyEnergyDcKwh,
          segmentAzimuthDegrees:
            p.segmentAzimuthDegrees ?? segments[p.segmentIndex]?.azimuthDegrees,
          segmentHeightMeters: p.segmentHeightMeters,
        }));
        setSolarPanels(enriched);

        setLiveLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLiveError(true);
        setLiveLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lead]);

  // Toggle a single panel's removed state. Called by PanelOverlayCesium when
  // the installer clicks a polygon. Stable identity so the overlay's
  // ScreenSpaceEventHandler doesn't churn on every render.
  const togglePanel = useCallback((key: string) => {
    setRemovedPanelKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Add a manually-placed panel. Called by PanelOverlayCesium when the
  // installer clicks an empty roof spot while editMode is on.
  const addManualPanel = useCallback((panel: SolarPanelEntry) => {
    setManuallyAddedPanels((prev) => [...prev, panel]);
  }, []);

  // Reset all manual edits — clear additions + un-remove everything.
  const resetPanelEdits = useCallback(() => {
    setManuallyAddedPanels([]);
    setRemovedPanelKeys(new Set());
  }, []);

  // Pro-rata recompute. Once the installer kills a few panels (or adds some
  // manual ones for under-utilised roof areas), scale every variant's monthly
  // savings by the active/total ratio and stretch payback inversely. We do
  // this BEFORE the variant cards render so the live numbers match what the
  // overlay shows. systemKwp also tracks active count.
  const sizerPanelCount = liveSizing?.panelCount ?? lead.publicPreview.sizing.panelCount;
  // AI panels: how many of Google's top-N are still active (not toggled off).
  // Manual panels: the installer's additions, minus any they then removed.
  // Each manual panel gets a stable key so removals are idempotent.
  const aiActiveCount = Math.max(
    0,
    sizerPanelCount - Array.from(removedPanelKeys).filter((k) => !k.startsWith("manual-")).length,
  );
  const manualActiveCount = manuallyAddedPanels.filter(
    (_p, idx) => !removedPanelKeys.has(`manual-${idx}`),
  ).length;
  const activePanelCount = aiActiveCount + manualActiveCount;
  const panelScale = sizerPanelCount > 0 ? activePanelCount / sizerPanelCount : 1;
  const variants: Variant[] = useMemo(() => {
    if (panelScale === 1) return baseVariants;
    return baseVariants.map((v) => ({
      ...v,
      monthlySavingsEur: Math.round(v.monthlySavingsEur * panelScale),
      // Payback scales inversely: fewer kWh produced → longer payback. Guard
      // against div-by-zero when the installer removes every panel — in that
      // case we leave the original payback in place (the variant card is
      // already useless at 0 panels).
      paybackYears:
        panelScale > 0
          ? Math.round((v.paybackYears / panelScale) * 10) / 10
          : v.paybackYears,
    }));
  }, [baseVariants, panelScale]);

  // Reconcile selected variant when variants list changes (e.g. live data swaps it).
  useEffect(() => {
    if (!variants.find((v) => v.id === selectedVariantId)) {
      setSelectedVariantId(variants[1]?.id ?? variants[0]?.id);
    }
  }, [variants, selectedVariantId]);

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    variants[1] ??
    variants[0];

  const selectedSourceUrls: VariantSourceUrls | undefined =
    liveSizing?.sourceUrls?.[selectedVariant.strategy as Strategy];

  const lines = useMemo(
    () => bomLines(selectedVariant.bom, selectedSourceUrls),
    [selectedVariant.bom, selectedSourceUrls],
  );

  const roofAreaValue =
    liveTotalAreaM2 ?? lead.publicPreview.roofFacts.totalAreaM2 ?? 0;
  const pitchValue = livePitchDeg
    ? Math.round(livePitchDeg)
    : lead.publicPreview.roofFacts.pitchDeg ?? "—";
  // When the installer toggles panels off, the headline numbers shift to the
  // active count. systemKwp uses the same 0.44 kWp/panel constant the sizer
  // assumes (lib/sizing/calculate.ts: 440 W modules).
  const panelCount = activePanelCount;
  const systemKwp =
    removedPanelKeys.size > 0
      ? Math.round(activePanelCount * PANEL_KWP * 10) / 10
      : liveSizing?.systemKwp ?? lead.publicPreview.sizing.systemKwp;
  const segmentsForLayout = liveSizing?.roofSegments ?? lead.publicPreview.sizing.roofSegments;

  // ---- AI-prefetched technical brief card data ----
  const briefSegments: RoofSegment[] =
    liveSegments ?? lead.publicPreview.sizing.roofSegments ?? [];
  const briefSegmentCount = briefSegments.length;
  const briefDominant = dominantBucket(briefSegments);
  const briefMedianSunshine = Math.round(
    median(briefSegments.map((s) => s.annualSunshineHours).filter((n) => n > 0)),
  );
  const briefAnnualKwh = liveSizing?.annualKwh ?? lead.publicPreview.sizing.annualKwh ?? 0;
  const briefRoofArea = Math.round(
    liveTotalAreaM2 ?? lead.publicPreview.roofFacts.totalAreaM2 ?? 0,
  );

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

  // Combined panel set rendered on the Cesium overlay: top-N AI panels +
  // every manually-placed panel. We slice/sort here once so the overlay
  // doesn't have to re-rank on each render. AI panels keep their stable
  // panelKey() based on lat/lng. Manual panels get a `manual-${idx}` key so
  // toggling them doesn't collide with the AI key namespace.
  const combinedOverlayPanels = useMemo<SolarPanelEntry[]>(() => {
    const sortedAi = [...solarPanels].sort(
      (a, b) => (b.yearlyEnergyDcKwh ?? 0) - (a.yearlyEnergyDcKwh ?? 0),
    );
    const aiSlice = sortedAi.slice(0, sizerPanelCount);
    return [...aiSlice, ...manuallyAddedPanels];
  }, [solarPanels, manuallyAddedPanels, sizerPanelCount]);

  // Default azimuth for new manual panels — use the dominant segment's
  // azimuth in degrees, so they tilt with the roof slope direction.
  const dominantAzimuthDegrees = useMemo<number>(() => {
    const segs = liveSegments ?? [];
    if (segs.length === 0) return 0;
    const sorted = [...segs].sort((a, b) => b.areaMeters2 - a.areaMeters2);
    return Math.round(sorted[0].azimuthDegrees ?? 180);
  }, [liveSegments]);

  return (
    <div
      className="grid min-h-0 flex-1 grid-rows-[minmax(380px,55vh)_1fr] bg-[#0A0E1A] xl:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] xl:grid-rows-[1fr]"
    >
      <section className="relative overflow-hidden border-b border-[#2A3038] bg-[#0A0E1A] xl:border-b-0 xl:border-r">
        <CesiumRoofView
          coords={{ lat: lead.privateDetails.lat, lng: lead.privateDetails.lng }}
          address={unlocked ? lead.privateDetails.address : lead.publicPreview.district}
          onViewerReady={setCesiumViewer}
        />
        {/* Headless: attaches/removes panel polygons on the photoreal mesh. */}
        <PanelOverlayCesium
          viewer={cesiumViewer}
          panels={combinedOverlayPanels}
          desiredCount={combinedOverlayPanels.length}
          removedKeys={removedPanelKeys}
          onPanelClick={togglePanel}
          visible={showPanels}
          editMode={editMode}
          onPanelAdd={addManualPanel}
          defaultAzimuthDegrees={dominantAzimuthDegrees}
        />
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-[#F7F8FA]">{lead.publicPreview.district}</div>
          <div className="mt-0.5 text-[#9BA3AF]">Exact rooftop model · customer details gated</div>
        </div>
        {/* Panel-edit toolbar: stacks toggle + edit-mode + reset on the
            top-right of the photoreal view. Only renders when the AI has
            produced (or the installer has placed) at least one panel. */}
        {(solarPanels.length > 0 || manuallyAddedPanels.length > 0) ? (
          <div className="absolute right-4 top-16 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowPanels((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-[#3DAEFF]/40 bg-[#0A0E1A]/85 px-2.5 py-1.5 text-[11px] font-medium text-[#F7F8FA] backdrop-blur transition-colors hover:border-[#3DAEFF] hover:bg-[#0A0E1A]"
              aria-pressed={showPanels}
            >
              {showPanels ? <EyeOff size={12} className="text-[#3DAEFF]" /> : <Eye size={12} className="text-[#3DAEFF]" />}
              {showPanels ? "Hide panels" : "Show panels"}
            </button>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition-colors ${
                editMode
                  ? "border-[#62E6A7] bg-[#62E6A7]/15 text-[#62E6A7] hover:bg-[#62E6A7]/25"
                  : "border-[#62E6A7]/40 bg-[#0A0E1A]/85 text-[#F7F8FA] hover:border-[#62E6A7]"
              }`}
              aria-pressed={editMode}
            >
              <Plus size={12} />
              {editMode ? "Editing — click roof to add" : "Add / remove panels"}
            </button>
            {(manuallyAddedPanels.length > 0 || removedPanelKeys.size > 0) ? (
              <button
                type="button"
                onClick={resetPanelEdits}
                className="flex items-center gap-1.5 rounded-md border border-[#5B6470] bg-[#0A0E1A]/85 px-2.5 py-1.5 text-[11px] font-medium text-[#9BA3AF] backdrop-blur transition-colors hover:border-[#F2B84B] hover:text-[#F2B84B]"
              >
                <RotateCcw size={12} />
                Reset edits
              </button>
            ) : null}
          </div>
        ) : null}
        {editMode ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-[#62E6A7]/40 bg-[#0A0E1A]/85 px-3 py-1.5 text-[11px] text-[#62E6A7] backdrop-blur">
            Click an empty roof spot to add a panel · click an existing panel to remove it
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-5 overflow-y-auto p-5 xl:p-6">
        <div className="flex flex-col gap-5">
          {/* AI-prefetched technical brief card */}
          <section className="rounded-lg border border-[#3DAEFF]/30 bg-gradient-to-br from-[#12161C] to-[#0A0E1A] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[#3DAEFF]" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F7F8FA]">
                  AI-prefetched technical brief
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#5B6470]">
                {liveLoading ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DAEFF]" />
                    Recomputing live
                  </>
                ) : liveError ? (
                  <span className="text-[#5B6470]">Using cached brief</span>
                ) : (
                  <span className="text-[#62E6A7]">Live Solar API</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {[
                { label: "Roof", value: `${briefRoofArea} m²` },
                { label: "Segs", value: String(briefSegmentCount) },
                { label: "Azimuth", value: briefDominant ?? "—" },
                { label: "Sun", value: `${briefMedianSunshine.toLocaleString()} h` },
                { label: "Demand", value: `${briefAnnualKwh.toLocaleString()} kWh` },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-md border border-[#2A3038] bg-[#0A0E1A] px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#5B6470]">{kpi.label}</div>
                  <div className="mt-0.5 text-xs font-semibold tabular-nums text-[#F7F8FA]">{kpi.value}</div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-snug text-[#5B6470]">
              AI pre-fetched via Google Solar API · roof + sun + demand profile attached to this lead.
            </p>
          </section>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9BA3AF]">
              Roof intelligence
            </h2>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#5B6470]">
              {liveLoading ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DAEFF]" />
                  Recomputing live
                </>
              ) : liveError ? (
                <span className="text-[#5B6470]">Using cached sizing</span>
              ) : (
                <span className="text-[#62E6A7]">Live Solar API</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Roof", value: `${roofAreaValue} m²` },
              { label: "Pitch", value: `${pitchValue}°` },
              { label: "Panels", value: `${panelCount}` },
              { label: "System", value: `${systemKwp} kWp` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-md border border-[#2A3038] bg-[#12161C] px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-[#5B6470]">{kpi.label}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-[#F7F8FA]">{kpi.value}</div>
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
              {variants.map((variant) => (
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

            {/* Active-panel status. Lives under the variant cards so the
                installer immediately sees the consequence of removing a
                panel — €/mo and payback above also update via panelScale. */}
            {sizerPanelCount > 0 || manuallyAddedPanels.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5B6470]">
                <span>
                  <span className="text-[#3DAEFF] tabular-nums">AI {sizerPanelCount}</span>
                  {manuallyAddedPanels.length > 0 ? (
                    <span className="text-[#62E6A7] tabular-nums"> · +{manuallyAddedPanels.length} manual</span>
                  ) : null}
                  {removedPanelKeys.size > 0 ? (
                    <span className="text-[#F2B84B] tabular-nums"> · −{removedPanelKeys.size} removed</span>
                  ) : null}
                </span>
                <span className="text-[#F7F8FA]">
                  = <span className="tabular-nums">{activePanelCount}</span> active
                </span>
                <span>· Click roof in 3D view to add/remove.</span>
              </div>
            ) : null}

            <div className="mt-4 divide-y divide-[#2A3038] rounded-lg border border-[#2A3038] bg-[#0A0E1A]">
              {lines.map((line) => (
                <div
                  key={line.label}
                  className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span className="text-[11px] uppercase tracking-wider text-[#9BA3AF]">
                    {line.label}
                  </span>
                  <div className="flex flex-col items-start gap-1.5 sm:items-end">
                    <span className="text-right text-sm text-[#F7F8FA]">{line.value}</span>
                    {line.sourceUrl ? <SourceUrlChip url={line.sourceUrl} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <PanelLayoutPreview
            segments={segmentsForLayout}
            panelCount={selectedVariant.bom.panels.count}
          />

          {/* Tavily / market-catalog attribution badge */}
          {liveSizing?.catalogScrapedAt ? (
            <div className="rounded-md border border-[#2A3038] bg-[#12161C] px-3 py-2 text-[11px] text-[#9BA3AF]">
              Live German solar market — scraped{" "}
              <span className="text-[#F7F8FA]">{relativeTime(liveSizing.catalogScrapedAt)}</span>{" "}
              via Tavily
              {liveSizing.catalogSource ? (
                <span className="text-[#5B6470]"> ({liveSizing.catalogSource})</span>
              ) : null}
            </div>
          ) : null}
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
          {liveSizing && (
            <SegmentBreakdown
              rows={liveSizing.segmentAllocations ?? []}
              totalPanels={liveSizing.panelCount}
              totalSystemKwp={liveSizing.systemKwp}
              mpptStringCount={liveSizing.mpptStringCount ?? 1}
            />
          )}
        </aside>
      </section>
    </div>
  );
}
