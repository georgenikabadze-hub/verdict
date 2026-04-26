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
  Sun,
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
  panelKey,
  type SolarPanelEntry,
} from "@/components/installer/PanelOverlayCesium";
import {
  SunHeatmapCesium,
  type SunHeatmapMeta,
} from "@/components/installer/SunHeatmapCesium";

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
    center?: { latitude?: number; longitude?: number };
  }>;
  totalAreaM2?: number;
  solarPanels?: Array<{
    center: { latitude: number; longitude: number };
    orientation: "LANDSCAPE" | "PORTRAIT";
    segmentIndex: number;
    yearlyEnergyDcKwh: number;
    segmentAzimuthDegrees?: number;
    segmentHeightMeters?: number;
    segmentPitchDegrees?: number;
    segmentCenterLat?: number;
    segmentCenterLng?: number;
  }>;
  boundingBox?: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
}

/** Watt-peak per panel — matches lib/sizing/calculate.ts (440W modules). */
const PANEL_KWP = 0.44;
const PANEL_AREA_M2 = 1.72 * 1.13;
const PANEL_MODULE_EFFICIENCY = 0.226;

interface DataLayersMeta extends SunHeatmapMeta {
  width?: number;
  height?: number;
}

interface HeatmapSampler {
  meta: DataLayersMeta;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

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

function heatPixelToT(r: number, g: number): number {
  // Inverse of lib/heatmaps/generate.ts red->yellow->green ramp.
  if (g < 250) return Math.max(0, Math.min(0.5, g / 510));
  return Math.max(0.5, Math.min(1, 1 - r / 510));
}

function sampleAnnualFluxKwhM2(
  sampler: HeatmapSampler | null,
  lat: number,
  lng: number,
): number | null {
  if (!sampler?.meta.fluxRange) return null;
  const { bounds, fluxRange } = sampler.meta;
  if (
    lat < bounds.south ||
    lat > bounds.north ||
    lng < bounds.west ||
    lng > bounds.east ||
    bounds.north <= bounds.south ||
    bounds.east <= bounds.west
  ) {
    return null;
  }
  const x = Math.round(
    ((lng - bounds.west) / (bounds.east - bounds.west)) *
      (sampler.canvas.width - 1),
  );
  const y = Math.round(
    ((bounds.north - lat) / (bounds.north - bounds.south)) *
      (sampler.canvas.height - 1),
  );
  try {
    const [r, g, , a] = sampler.ctx.getImageData(x, y, 1, 1).data;
    if (a < 10) return null;
    const t = heatPixelToT(r, g);
    return fluxRange.min + t * (fluxRange.max - fluxRange.min);
  } catch {
    return null;
  }
}

function fluxToPanelYieldKwh(annualFluxKwhM2: number): number {
  return annualFluxKwhM2 * PANEL_AREA_M2 * PANEL_MODULE_EFFICIENCY;
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
  const [overlayRoofSegments, setOverlayRoofSegments] =
    useState<NonNullable<RoofFactsResponse["segments"]>>([]);
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
  // segmentIndex set the installer toggled OFF in the SegmentBreakdown
  // sidebar. AI panels with these segmentIndex values are filtered out of
  // the Cesium overlay AND counted out of the BoM scale, so the installer
  // can deliberately exclude e.g. north-facing wings to concentrate capex
  // on the high-yield south face. Manual panels (segmentIndex = -1) are
  // never affected because they sit outside the per-segment yield model.
  const [disabledSegmentIndexes, setDisabledSegmentIndexes] = useState<Set<number>>(
    new Set(),
  );
  const [showPanels, setShowPanels] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [sunLayerVisible, setSunLayerVisible] = useState(true);
  const [heatmapMeta, setHeatmapMeta] = useState<DataLayersMeta | null>(null);
  const [heatmapSampler, setHeatmapSampler] = useState<HeatmapSampler | null>(null);
  const [heatmapStatus, setHeatmapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Installer review is anchored to the lead the homeowner actually sent.
  // Live roof facts may recompute a larger demand-cap system after creation
  // (notably HP+EV), but the visible overlay and BoM must agree with the
  // stored customer preview count.
  const leadPanelCount = lead.publicPreview.sizing.panelCount;
  // Always use publicPreview.bomVariants for the BoM display. liveSizing
  // can recompute a different panel count (e.g. when HP+EV preferences
  // inflate futureDemand and the demand-cap pushes the optimizer higher).
  // If we showed liveSizing's BoM total but pinned the count to the lead
  // preview's count, totalEur would reflect a different system size than
  // the displayed panel count — and the per-panel cost would be obviously
  // wrong (e.g. €3,800/panel for a household-scale install). The
  // publicPreview's BoM was composed at lead creation time with exactly
  // panelCount panels, so its totalEur and count are by construction
  // consistent.
  const baseVariants: Variant[] = useMemo(
    () =>
      lead.publicPreview.bomVariants.map((variant) => ({
        ...variant,
        bom: {
          ...variant.bom,
          panels: {
            ...variant.bom.panels,
            count: leadPanelCount,
          },
        },
      })),
    [lead.publicPreview.bomVariants, leadPanelCount],
  );

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
    setDisabledSegmentIndexes(new Set());
    setOverlayRoofSegments([]);
    setEditMode(false);
    setHeatmapMeta(null);
    setHeatmapSampler(null);
    setHeatmapStatus("loading");
    setSunLayerVisible(true);

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
        setOverlayRoofSegments(rawSegments);
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
          segmentPitchDegrees:
            p.segmentPitchDegrees ?? segments[p.segmentIndex]?.pitchDegrees,
          segmentHeightMeters: p.segmentHeightMeters,
          segmentCenterLat: p.segmentCenterLat,
          segmentCenterLng: p.segmentCenterLng,
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

  useEffect(() => {
    let cancelled = false;
    const { lat, lng } = lead.privateDetails;

    setHeatmapStatus("loading");
    fetch(`/api/data-layers?lat=${lat}&lng=${lng}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("data-layers failed");
        return res.json() as Promise<DataLayersMeta>;
      })
      .then((meta) => {
        if (cancelled || !meta?.imageUrl || !meta.bounds) return;
        setHeatmapMeta(meta);

        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth || meta.width || 1;
          canvas.height = image.naturalHeight || meta.height || 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            setHeatmapStatus("error");
            return;
          }
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          setHeatmapSampler({ meta, canvas, ctx });
          setHeatmapStatus("ready");
        };
        image.onerror = () => {
          if (!cancelled) setHeatmapStatus("error");
        };
        image.src = meta.imageUrl;
      })
      .catch(() => {
        if (cancelled) return;
        setHeatmapMeta(null);
        setHeatmapSampler(null);
        setHeatmapStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [lead.privateDetails.lat, lead.privateDetails.lng]);

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

  // Reset all manual edits — clear additions + un-remove everything +
  // re-enable any segments the installer toggled off.
  const resetPanelEdits = useCallback(() => {
    setManuallyAddedPanels([]);
    setRemovedPanelKeys(new Set());
    setDisabledSegmentIndexes(new Set());
  }, []);

  // Toggle a roof segment on/off in the SegmentBreakdown sidebar. AI panels
  // belonging to disabled segments are pulled from the Cesium overlay and
  // also counted out of the BoM scale, so the installer can exclude e.g.
  // north-facing wings without ad-hoc per-panel removal.
  const toggleSegment = useCallback((segmentIndex: number) => {
    setDisabledSegmentIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(segmentIndex)) next.delete(segmentIndex);
      else next.add(segmentIndex);
      return next;
    });
  }, []);

  // Panel target used by the overlay and BoM display. Keep this tied to the
  // stored lead preview so a live re-size cannot silently turn a 13-panel
  // homeowner quote into a 30-panel installer overlay.
  const sizerPanelCount = leadPanelCount;

  const panelYieldKwh = useCallback(
    (panel: SolarPanelEntry): number => {
      const sampledFlux = sampleAnnualFluxKwhM2(
        heatmapSampler,
        panel.center.latitude,
        panel.center.longitude,
      );
      if (sampledFlux !== null) return fluxToPanelYieldKwh(sampledFlux);
      return Math.max(0, panel.yearlyEnergyDcKwh ?? 0);
    },
    [heatmapSampler],
  );

  const highestYieldSegmentIndex = useMemo<number | null>(() => {
    const totals = new Map<number, { total: number; count: number }>();
    for (const p of solarPanels) {
      if (p.segmentIndex < 0) continue;
      const entry = totals.get(p.segmentIndex) ?? { total: 0, count: 0 };
      entry.total += panelYieldKwh(p);
      entry.count += 1;
      totals.set(p.segmentIndex, entry);
    }
    let bestIndex: number | null = null;
    let bestTotal = -Infinity;
    let bestAverage = -Infinity;
    for (const [segmentIndex, entry] of totals) {
      const average = entry.count > 0 ? entry.total / entry.count : 0;
      if (
        entry.total > bestTotal ||
        (entry.total === bestTotal && average > bestAverage) ||
        (entry.total === bestTotal && average === bestAverage && segmentIndex < (bestIndex ?? Infinity))
      ) {
        bestIndex = segmentIndex;
        bestTotal = entry.total;
        bestAverage = average;
      }
    }
    return bestIndex;
  }, [solarPanels, panelYieldKwh]);

  // Top-N AI panels by yield on one roof face. This trades a few theoretical
  // kWh for a clean rectangular demo layout and avoids mixing azimuths.
  const aiTopSlice = useMemo<SolarPanelEntry[]>(() => {
    const eligible =
      highestYieldSegmentIndex === null
        ? solarPanels
        : solarPanels.filter((p) => p.segmentIndex === highestYieldSegmentIndex);
    const sortedAi = [...eligible].sort(
      (a, b) => panelYieldKwh(b) - panelYieldKwh(a),
    );
    return sortedAi.slice(0, sizerPanelCount);
  }, [solarPanels, highestYieldSegmentIndex, sizerPanelCount, panelYieldKwh]);
  const aiDisabledBySegmentCount = useMemo(
    () =>
      aiTopSlice.filter((p) => disabledSegmentIndexes.has(p.segmentIndex)).length,
    [aiTopSlice, disabledSegmentIndexes],
  );

  // AI panels: how many of Google's top-N are still active. A panel is
  // inactive if either (a) the installer toggled it off via panel-click, or
  // (b) its roof segment was toggled off in the SegmentBreakdown sidebar.
  const aiActiveCount = Math.max(
    0,
    aiTopSlice.length -
      Array.from(removedPanelKeys).filter((k) => !k.startsWith("manual-")).length -
      aiDisabledBySegmentCount,
  );
  const manualActiveCount = manuallyAddedPanels.filter(
    (_p, idx) => !removedPanelKeys.has(`manual-${idx}`),
  ).length;
  const activePanelCount =
    solarPanels.length === 0 ? sizerPanelCount + manualActiveCount : aiActiveCount + manualActiveCount;
  const totalSlicedYieldKwh = useMemo(
    () => aiTopSlice.reduce((sum, p) => sum + panelYieldKwh(p), 0),
    [aiTopSlice, panelYieldKwh],
  );
  const activeYieldKwh = useMemo(
    () =>
      aiTopSlice.reduce((sum, p, idx) => {
        if (disabledSegmentIndexes.has(p.segmentIndex)) return sum;
        const key = panelKey(idx, p.center.latitude, p.center.longitude);
        if (removedPanelKeys.has(key)) return sum;
        return sum + panelYieldKwh(p);
      }, manuallyAddedPanels.reduce((sum, p, idx) => {
        if (removedPanelKeys.has(`manual-${idx}`)) return sum;
        return sum + panelYieldKwh(p);
      }, 0)),
    [aiTopSlice, disabledSegmentIndexes, manuallyAddedPanels, panelYieldKwh, removedPanelKeys],
  );
  const yieldScale = totalSlicedYieldKwh > 0 ? activeYieldKwh / totalSlicedYieldKwh : 1;
  const variants: Variant[] = useMemo(() => {
    return baseVariants.map((v) => ({
      ...v,
      bom: {
        ...v.bom,
        panels: {
          ...v.bom.panels,
          count: activePanelCount,
        },
      },
      monthlySavingsEur: Math.round(v.monthlySavingsEur * yieldScale),
      // Payback scales inversely with expected production. Removing a high-
      // yield panel now hurts more than removing a weak one.
      paybackYears:
        yieldScale > 0
          ? Math.round((v.paybackYears / yieldScale) * 10) / 10
          : v.paybackYears,
    }));
  }, [baseVariants, activePanelCount, yieldScale]);

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
    Math.round(activePanelCount * PANEL_KWP * 10) / 10;
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
    // Drop AI panels whose segmentIndex was toggled off in the sidebar.
    // Manual panels (segmentIndex = -1) always pass through — they live
    // outside the per-segment yield model.
    const aiEnabled = aiTopSlice.filter(
      (p) => !disabledSegmentIndexes.has(p.segmentIndex),
    );
    return [...aiEnabled, ...manuallyAddedPanels];
  }, [aiTopSlice, manuallyAddedPanels, disabledSegmentIndexes]);

  // Default azimuth + pitch for new manual panels — use the dominant
  // segment's values so click-to-add panels tilt with the same slope as
  // their AI counterparts.
  const dominantAzimuthDegrees = useMemo<number>(() => {
    const segs = liveSegments ?? [];
    if (segs.length === 0) return 0;
    const sorted = [...segs].sort((a, b) => b.areaMeters2 - a.areaMeters2);
    return Math.round(sorted[0].azimuthDegrees ?? 180);
  }, [liveSegments]);
  const dominantPitchDegrees = useMemo<number>(() => {
    const segs = liveSegments ?? [];
    if (segs.length === 0) return 0;
    const sorted = [...segs].sort((a, b) => b.areaMeters2 - a.areaMeters2);
    return Math.round(sorted[0].pitchDegrees ?? 0);
  }, [liveSegments]);

  return (
    // Stacked layout: full-width photoreal map on top, dashboard scrolls
    // below. The map gets the user's full screen real estate so they can
    // pan/zoom/edit panels comfortably without competing with a side panel
    // for cursor space, then they scroll for the BoM + variant cards.
    // Map height = min(720px, 70vh) so it dominates a typical 1080p laptop
    // screen but doesn't go absurd on a 1440p+ monitor.
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0E1A]">
      <section className="relative h-[min(720px,70vh)] flex-shrink-0 overflow-hidden border-b border-[#2A3038] bg-[#0A0E1A]">
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
          defaultPitchDegrees={dominantPitchDegrees}
          roofSegments={overlayRoofSegments}
        />
        <SunHeatmapCesium
          viewer={cesiumViewer}
          heatmap={heatmapMeta}
          visible={sunLayerVisible && heatmapStatus === "ready"}
        />
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-[#2A3038] bg-[#0A0E1A]/80 px-3 py-2 text-xs backdrop-blur">
          <div className="font-semibold text-[#F7F8FA]">{lead.publicPreview.district}</div>
          <div className="mt-0.5 text-[#9BA3AF]">Exact rooftop model · customer details gated</div>
        </div>
        {/* Panel-edit toolbar: bottom-right so it does not cover the
            dimensions disclosure/camera controls in the top-right corner. */}
        {(solarPanels.length > 0 || manuallyAddedPanels.length > 0) ? (
          <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setSunLayerVisible((v) => !v)}
              disabled={heatmapStatus !== "ready"}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                sunLayerVisible && heatmapStatus === "ready"
                  ? "border-[#62E6A7] bg-[#62E6A7]/15 text-[#62E6A7] hover:bg-[#62E6A7]/25"
                  : "border-[#F2B84B]/40 bg-[#0A0E1A]/85 text-[#F7F8FA] hover:border-[#F2B84B]"
              }`}
              aria-pressed={sunLayerVisible && heatmapStatus === "ready"}
            >
              <Sun size={12} />
              {heatmapStatus === "loading"
                ? "Loading sun"
                : sunLayerVisible && heatmapStatus === "ready"
                  ? "Hide sun layer"
                  : "Sun layer"}
            </button>
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

      <section className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 xl:p-6">
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
                  {/* Homeowner voice memo recorded at intake via Gradium AI.
                      Plays the audio in-line and shows the transcript Gradium
                      STT generated server-side. Free-form context the form
                      fields couldn't capture. */}
                  {lead.privateDetails.voiceNote?.audioDataUrl ? (
                    <div className="mt-3 rounded-md border border-[#62E6A7]/30 bg-[#62E6A7]/5 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-[#62E6A7]">
                        <span>Voice memo · Gradium AI</span>
                        {typeof lead.privateDetails.voiceNote.durationMs === "number" ? (
                          <span className="tabular-nums text-[#9BA3AF]">
                            {(lead.privateDetails.voiceNote.durationMs / 1000).toFixed(1)} s
                          </span>
                        ) : null}
                      </div>
                      <audio
                        controls
                        src={lead.privateDetails.voiceNote.audioDataUrl}
                        className="h-7 w-full"
                        preload="metadata"
                      />
                      {lead.privateDetails.voiceNote.transcript ? (
                        <div className="mt-2 rounded border border-[#2A3038] bg-[#0A0E1A] p-2 text-xs leading-relaxed text-[#F7F8FA]">
                          “{lead.privateDetails.voiceNote.transcript}”
                        </div>
                      ) : null}
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
              disabledSegmentIndexes={disabledSegmentIndexes}
              onToggleSegment={toggleSegment}
            />
          )}
        </aside>
      </section>
    </div>
  );
}
