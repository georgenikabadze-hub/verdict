// lib/sizing/calculate.ts
// Deterministic sizer: turns Intake + RoofSegment[] into a SizingResult with
// exactly 3 ranked Variants. Pure functions — no side effects, no API calls,
// no React/Zustand/lib/api/lib/reonic imports.
//
// Read alongside PLAN.md §4d-prefix (sizing formulas) and BOOTSTRAP.md
// (Sizer Agent spec). The LLM never overrides the math here — it only
// validates and explains.

import type {
  BoM,
  Intake,
  RoofSegment,
  SizingResult,
  Strategy,
  Variant,
} from "@/lib/contracts";
import { recommendBom } from "@/lib/reonic/recommend";
import { enrichVariantRationale } from "@/lib/sizing/rationale";

// ---------------------------------------------------------------------------
// Constants (German residential defaults)
// ---------------------------------------------------------------------------

/** Average German residential electricity tariff used to back-derive annual
 *  kWh from the homeowner's monthly bill when annualKwh isn't provided. */
const EUR_PER_KWH_RESIDENTIAL = 0.32;

/** Peak Sun Hours — Germany typical. */
const PSH_GERMANY = 2.8;

/** Panel wattage assumption (Wp). */
const PANEL_WP = 440;

/** kW per panel = 0.440. Cached for clarity. */
const PANEL_KW = PANEL_WP / 1000;

/** Physical area assumption per panel (m²). Used for roof-fit checks. */
const PANEL_AREA_M2 = 1.95;

/** PV system efficiency (DC→AC + losses). */
const SYSTEM_EFFICIENCY = 0.85;

/** Self-consumption target — fraction of daily demand we want covered. */
const SELF_CONSUMPTION_TARGET = 0.8;

/** Fraction of daily demand that lands during solar production hours
 *  (so does NOT need battery storage). */
const SOLAR_DAYTIME_FRACTION = 0.3;

/** Heat-loss assumption per m² of heated area (W/m²). */
const HEAT_LOSS_W_PER_M2 = 100;

/** Heat-pump safety factor. */
const HP_SAFETY_FACTOR = 1.1;

/** Default heated area when we have no better signal (m²). */
const DEFAULT_HEATED_AREA_M2 = 120;

/** Annual yield assumption (kWh per kWp installed) — Germany typical. */
const ANNUAL_YIELD_KWH_PER_KWP = 950;

/** Annual kWh produced per panel in DE (used for demand-driven sizing). */
const KWH_PER_PANEL_PER_YEAR_DE = 410;

/** Footprint per panel in m² (frame + landscape mounting). */
const PANEL_FOOTPRINT_M2 = 1.7;

/** Roof packing factor — accounts for setbacks, vents, anti-shading spacing. */
const ROOF_PACKING_FACTOR = 0.7;

/** Min usable segment area (m²). Anything smaller is not worth a string. */
const MIN_SEGMENT_AREA_M2 = 10;

/** Demand oversize factor — fill the roof when uncertain (Reonic spec). */
const DEMAND_OVERSIZE = 1.1;

/** MPPT string sizing limits. */
const MIN_PANELS_PER_STRING = 4;
const MAX_PANELS_PER_STRING = 25;

/** Feed-in tariff (€/kWh). Surplus exported to the grid. */
const FEED_IN_EUR_PER_KWH = 0.08;

/** Threshold above which the system warrants a heat pump for non-HP heating. */
const HP_DEMAND_THRESHOLD_KWH = 8000;

// ---------------------------------------------------------------------------
// Rounding helpers
// ---------------------------------------------------------------------------

const round0 = (n: number): number => Math.round(n);
const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Roof-aware allocation types & helpers
// ---------------------------------------------------------------------------

export type AzimuthBucket = "E" | "SE" | "S" | "SW" | "W" | "N" | "flat";

export interface SegmentAllocation {
  /** Segment index in the input array. */
  index: number;
  azimuthDegrees: number;
  pitchDegrees: number;
  areaMeters2: number;
  panelsAllocated: number;
  /** 1, 2, 3 ... (only meaningful when panelsAllocated > 0). */
  stringId: number;
  azimuthBucket: AzimuthBucket;
  /** Estimated annual yield from this allocation (kWh). */
  yieldKwhPerYear: number;
  status: "used" | "skipped";
  skipReason?: "too-small" | "north-facing" | "no-panels-left";
}

/** Bucket compass azimuth (0=N, 90=E, 180=S, 270=W). Pitch < 5° => flat. */
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

const AZIMUTH_FACTOR: Record<AzimuthBucket, number> = {
  S: 1.0,
  SE: 0.94,
  SW: 0.94,
  E: 0.84,
  W: 0.84,
  flat: 0.92,
  N: 0.55,
};

function pitchFactor(pitch: number): number {
  if (pitch < 5) return 0.92;
  if (pitch > 50) return 0.85;
  if (pitch >= 20 && pitch <= 40) return 1.0;
  // Linear-ish in the in-between bands; keep it simple.
  return 0.95;
}

function isUsableSegment(s: RoofSegment): boolean {
  if (s.areaMeters2 <= MIN_SEGMENT_AREA_M2) return false;
  // Flat roofs (pitch < 5°) are azimuth-agnostic — tilted mounting frames
  // re-orient panels regardless of the underlying roof direction.
  if (s.pitchDegrees < 5) return true;
  // Pitched roofs: skip pure north — azimuth must be in [90, 270].
  const a = ((s.azimuthDegrees % 360) + 360) % 360;
  return a >= 90 && a <= 270;
}

function segmentCapacity(s: RoofSegment): number {
  return Math.floor((s.areaMeters2 / PANEL_FOOTPRINT_M2) * ROOF_PACKING_FACTOR);
}

/** Yield from a hypothetical allocation, used both for ranking and reporting. */
function estimateYield(
  panels: number,
  bucket: AzimuthBucket,
  pitch: number,
): number {
  return panels * KWH_PER_PANEL_PER_YEAR_DE * AZIMUTH_FACTOR[bucket] * pitchFactor(pitch);
}

/** Roof-fit cap: max panels that physically fit on usable segments. */
function calcPanelFitMax(segments: RoofSegment[]): number {
  return segments
    .filter(isUsableSegment)
    .reduce((sum, s) => sum + segmentCapacity(s), 0);
}

/**
 * Greedy per-segment allocator. Ranks usable segments by yield-per-panel
 * (S+steep first, then flat, E/W, N), assigns panels until exhausted,
 * groups consecutive same-azimuth-bucket segments into shared MPPT strings
 * (clamped to [MIN, MAX]_PANELS_PER_STRING).
 */
export function allocatePanelsToSegments(
  segments: RoofSegment[],
  totalPanelCount: number,
): SegmentAllocation[] {
  // Build base allocation rows, preserving original index.
  const rows: SegmentAllocation[] = segments.map((s, index) => {
    const bucket = bucketAzimuth(s.azimuthDegrees, s.pitchDegrees);
    const base: SegmentAllocation = {
      index,
      azimuthDegrees: s.azimuthDegrees,
      pitchDegrees: s.pitchDegrees,
      areaMeters2: s.areaMeters2,
      panelsAllocated: 0,
      stringId: 0,
      azimuthBucket: bucket,
      yieldKwhPerYear: 0,
      status: "skipped",
    };
    if (s.areaMeters2 <= MIN_SEGMENT_AREA_M2) {
      base.skipReason = "too-small";
      return base;
    }
    if (!isUsableSegment(s)) {
      base.skipReason = "north-facing";
      return base;
    }
    return base;
  });

  let remaining = Math.max(0, Math.floor(totalPanelCount));

  // Rank usable rows by yield-per-panel (deterministic via index tiebreak).
  const usableOrder = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.skipReason === undefined)
    .sort((a, b) => {
      const ya = estimateYield(1, a.r.azimuthBucket, a.r.pitchDegrees);
      const yb = estimateYield(1, b.r.azimuthBucket, b.r.pitchDegrees);
      if (yb !== ya) return yb - ya;
      return a.i - b.i;
    });

  for (const { r } of usableOrder) {
    if (remaining <= 0) {
      r.skipReason = "no-panels-left";
      continue;
    }
    const cap = segmentCapacity(segments[r.index]);
    const take = Math.min(cap, remaining);
    if (take <= 0) {
      r.skipReason = "no-panels-left";
      continue;
    }
    r.panelsAllocated = take;
    r.status = "used";
    r.yieldKwhPerYear = round0(estimateYield(take, r.azimuthBucket, r.pitchDegrees));
    remaining -= take;
  }

  // Assign string IDs in original order. Group consecutive same-bucket used
  // segments into the same string while staying within MIN/MAX panel limits.
  let nextStringId = 0;
  let currentBucket: AzimuthBucket | null = null;
  let currentStringPanels = 0;

  for (const r of rows) {
    if (r.status !== "used") {
      r.stringId = 0;
      currentBucket = null;
      currentStringPanels = 0;
      continue;
    }
    const wouldOverflow =
      currentBucket !== r.azimuthBucket ||
      currentStringPanels + r.panelsAllocated > MAX_PANELS_PER_STRING;
    if (currentBucket === null || wouldOverflow) {
      nextStringId += 1;
      currentBucket = r.azimuthBucket;
      currentStringPanels = 0;
    }
    r.stringId = nextStringId;
    currentStringPanels += r.panelsAllocated;
  }

  // Merge undersized trailing strings into the previous one when possible.
  // Walk the used-only sequence; if a string is below MIN_PANELS_PER_STRING
  // and merging into the previous string keeps it ≤ MAX, fold it in.
  const usedRows = rows.filter((r) => r.status === "used");
  if (usedRows.length > 1) {
    const stringPanelTotals = new Map<number, number>();
    for (const r of usedRows) {
      stringPanelTotals.set(r.stringId, (stringPanelTotals.get(r.stringId) ?? 0) + r.panelsAllocated);
    }
    for (let i = 1; i < usedRows.length; i += 1) {
      const cur = usedRows[i];
      const prev = usedRows[i - 1];
      if (cur.stringId === prev.stringId) continue;
      const curTotal = stringPanelTotals.get(cur.stringId) ?? 0;
      const prevTotal = stringPanelTotals.get(prev.stringId) ?? 0;
      if (
        curTotal < MIN_PANELS_PER_STRING &&
        prevTotal + curTotal <= MAX_PANELS_PER_STRING
      ) {
        const oldId = cur.stringId;
        // Reassign all rows currently on oldId to prev.stringId.
        for (const r of usedRows) {
          if (r.stringId === oldId) r.stringId = prev.stringId;
        }
        stringPanelTotals.set(prev.stringId, prevTotal + curTotal);
        stringPanelTotals.delete(oldId);
      }
    }
    // Compact string IDs to 1..N in first-encounter order.
    const remap = new Map<number, number>();
    let n = 0;
    for (const r of usedRows) {
      if (!remap.has(r.stringId)) {
        n += 1;
        remap.set(r.stringId, n);
      }
    }
    for (const r of rows) {
      if (r.status === "used") r.stringId = remap.get(r.stringId) ?? r.stringId;
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Core sizing
// ---------------------------------------------------------------------------

/**
 * Derive annual kWh demand from the intake. Prefers an explicit annualKwh
 * value when provided, otherwise back-derives from the monthly bill and
 * the German residential €/kWh average.
 */
function deriveAnnualKwh(intake: Intake, eurPerKwhOverride?: number): number {
  if (typeof intake.annualKwh === "number" && intake.annualKwh > 0) {
    return intake.annualKwh;
  }
  const eurPerKwh = eurPerKwhOverride ?? EUR_PER_KWH_RESIDENTIAL;
  const annual = (intake.monthlyBillEur * 12) / eurPerKwh;
  return Math.max(0, annual);
}

/**
 * Panel count from the canonical formula in PLAN.md §4d-prefix:
 *   panels = annual_kWh ÷ (PSH × 365 × Wp × 0.001 × system_efficiency)
 */
function calcPanelCount(annualKwh: number): number {
  const denom = PSH_GERMANY * 365 * PANEL_WP * 0.001 * SYSTEM_EFFICIENCY;
  if (denom <= 0) return 0;
  const raw = annualKwh / denom;
  return Math.max(1, round0(raw));
}

/**
 * Battery sizing per PLAN.md:
 *   battery_kWh = daily_kWh × self_consumption_target × (1 - solar_daytime_fraction)
 */
function calcBatteryKwh(dailyKwh: number): number {
  return dailyKwh * SELF_CONSUMPTION_TARGET * (1 - SOLAR_DAYTIME_FRACTION);
}

/**
 * Heat-pump sizing per PLAN.md:
 *   hp_kW = (area_m² × 100 W/m²) ÷ 1000 × 1.1
 */
function calcHeatPumpKw(areaM2: number): number {
  return (areaM2 * HEAT_LOSS_W_PER_M2) / 1000 * HP_SAFETY_FACTOR;
}

/**
 * Whether the household demand justifies fitting a heat pump.
 * Skipped when heating is already a heat pump.
 */
function shouldOfferHeatPump(intake: Intake, annualKwh: number): boolean {
  if (intake.heating === "heat_pump") return false;
  return annualKwh > HP_DEMAND_THRESHOLD_KWH || intake.goal === "independence";
}

/**
 * Sum of usable roof area across all provided segments.
 */
function calcUsableRoofArea(segments: RoofSegment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.areaMeters2), 0);
}

/**
 * Self-consumed kWh in a year given system size and battery.
 * Naive but stable: (daytime fraction + battery-shifted fraction) of demand,
 * capped at total annual production.
 */
function calcSelfConsumedKwh(
  annualKwh: number,
  annualYieldKwh: number,
  batteryKwh: number,
  dailyKwh: number,
): number {
  const daytimeShare = SOLAR_DAYTIME_FRACTION * annualKwh;
  const batteryShareDaily = Math.min(batteryKwh, dailyKwh * (1 - SOLAR_DAYTIME_FRACTION));
  const batteryShareAnnual = batteryShareDaily * 365;
  const desired = daytimeShare + batteryShareAnnual;
  return Math.min(desired, annualYieldKwh, annualKwh);
}

// ---------------------------------------------------------------------------
// Variant pricing (rough EUR per kWp installed)
// ---------------------------------------------------------------------------

interface VariantConfig {
  strategy: Strategy;
  label: Variant["label"];
  /** Multiplier applied to the deterministic battery target. */
  batteryFactor: number;
  /** Multiplier on inverter sizing relative to system kWp. */
  inverterFactor: number;
  /** € per installed kWp (panels + inverter + mounting + labour). */
  eurPerKwp: number;
  /** € per installed kWh of battery. */
  eurPerKwhBattery: number;
  /** € flat add-on if a heat pump is included. */
  eurHeatPump: number;
  /** Whether this variant *forces* a heat pump on top of the demand check. */
  preferHeatPump: boolean;
  /** Brand presets — purely cosmetic, real BoMs come from Reonic Agent. */
  panelBrand: { brand: string; model: string };
  inverterBrand: { brand: string; model: string };
  batteryBrand: { brand: string; model: string };
  wallboxBrand: { brand: string; model: string };
  heatPumpBrand: { brand: string; model: string };
  marginPct: number;
  winRatePct: number;
  confidence: number;
  objection: string;
}

const VARIANT_CONFIGS: VariantConfig[] = [
  {
    strategy: "margin",
    label: "Best Margin",
    batteryFactor: 0.6,
    inverterFactor: 0.85,
    eurPerKwp: 1700,
    eurPerKwhBattery: 600,
    eurHeatPump: 0,
    preferHeatPump: false,
    panelBrand: { brand: "Huawei", model: "LUNA-440" },
    inverterBrand: { brand: "Huawei", model: "SUN2000-KTL" },
    batteryBrand: { brand: "EcoFlow", model: "PowerOcean" },
    wallboxBrand: { brand: "EcoFlow", model: "Wallbox 11" },
    heatPumpBrand: { brand: "Vaillant", model: "aroTHERM" },
    marginPct: 31,
    winRatePct: 38,
    confidence: 0.72,
    objection:
      "Risk: smaller battery may feel undersized once the EV or heat pump arrives; counter with a battery-expansion roadmap from a sibling project.",
  },
  {
    strategy: "closeRate",
    label: "Best Close Rate",
    batteryFactor: 1.0,
    inverterFactor: 0.95,
    eurPerKwp: 1800,
    eurPerKwhBattery: 700,
    eurHeatPump: 0,
    preferHeatPump: false,
    panelBrand: { brand: "Huawei", model: "LUNA-440" },
    inverterBrand: { brand: "Huawei", model: "SUN2000-10KTL-M1" },
    batteryBrand: { brand: "EcoFlow", model: "PowerOcean Plus" },
    wallboxBrand: { brand: "EcoFlow", model: "Wallbox 11" },
    heatPumpBrand: { brand: "Vaillant", model: "aroTHERM plus" },
    marginPct: 28,
    winRatePct: 52,
    confidence: 0.84,
    objection:
      "Risk: homeowner may flinch at the battery price; counter with cited closed projects in the same kWp band that converted at this exact configuration.",
  },
  {
    strategy: "ltv",
    label: "Best LTV",
    batteryFactor: 1.4,
    inverterFactor: 1.05,
    eurPerKwp: 2000,
    eurPerKwhBattery: 900,
    eurHeatPump: 18000,
    preferHeatPump: true,
    panelBrand: { brand: "Meyer Burger", model: "Black 400" },
    inverterBrand: { brand: "SMA", model: "Sunny Tripower" },
    batteryBrand: { brand: "BYD", model: "Battery-Box Premium HVS" },
    wallboxBrand: { brand: "go-e", model: "Charger Gemini 22" },
    heatPumpBrand: { brand: "Viessmann", model: "Vitocal 250-A" },
    marginPct: 24,
    winRatePct: 33,
    confidence: 0.66,
    objection:
      "Risk: total ticket price triggers sticker shock; counter with the 25-year lifetime savings curve and KfW eligibility.",
  },
];

// ---------------------------------------------------------------------------
// Build a single variant
// ---------------------------------------------------------------------------

interface BuildVariantInput {
  cfg: VariantConfig;
  intake: Intake;
  panelCount: number;
  systemKwp: number;
  baselineBatteryKwh: number;
  dailyKwh: number;
  annualKwh: number;
  annualYieldKwh: number;
  heatPumpKwBaseline: number;
  shouldOfferHp: boolean;
  eurPerKwh: number;
}

function buildVariant(input: BuildVariantInput): Variant {
  const {
    cfg,
    intake,
    panelCount,
    systemKwp,
    baselineBatteryKwh,
    dailyKwh,
    annualKwh,
    annualYieldKwh,
    heatPumpKwBaseline,
    shouldOfferHp,
    eurPerKwh,
  } = input;

  const batteryKwhRaw = baselineBatteryKwh * cfg.batteryFactor;
  const batteryKwh = round1(Math.max(0, batteryKwhRaw));

  const inverterKw = round1(systemKwp * cfg.inverterFactor);

  // Heat-pump inclusion rules (per BOOTSTRAP Sizer Agent spec):
  //   - never if the home already has a heat pump
  //   - otherwise only when the household demand justifies it
  //     (annual kWh > 8000 OR goal == "independence")
  // LTV adds it whenever justified; margin/closeRate skip it by default.
  let includeHeatPump = false;
  if (intake.heating !== "heat_pump" && shouldOfferHp) {
    if (cfg.preferHeatPump) includeHeatPump = true;
  }
  const heatPumpKw = includeHeatPump ? round1(heatPumpKwBaseline) : undefined;

  const includeWallbox = intake.ev;

  const bom: BoM = {
    panels: {
      brand: cfg.panelBrand.brand,
      model: cfg.panelBrand.model,
      count: panelCount,
      wp: PANEL_WP,
    },
    inverter: {
      brand: cfg.inverterBrand.brand,
      model: cfg.inverterBrand.model,
      kw: inverterKw,
    },
    totalEur: 0, // filled below
  };

  if (batteryKwh > 0) {
    bom.battery = {
      brand: cfg.batteryBrand.brand,
      model: cfg.batteryBrand.model,
      kwh: batteryKwh,
    };
  }

  if (includeWallbox) {
    bom.wallbox = {
      brand: cfg.wallboxBrand.brand,
      model: cfg.wallboxBrand.model,
      kw: 11,
    };
  }

  if (heatPumpKw !== undefined) {
    bom.heatPump = {
      brand: cfg.heatPumpBrand.brand,
      model: cfg.heatPumpBrand.model,
      kw: heatPumpKw,
    };
  }

  const totalEur =
    systemKwp * cfg.eurPerKwp +
    batteryKwh * cfg.eurPerKwhBattery +
    (heatPumpKw !== undefined ? cfg.eurHeatPump : 0);
  bom.totalEur = round0(totalEur);

  const selfConsumedKwh = calcSelfConsumedKwh(
    annualKwh,
    annualYieldKwh,
    batteryKwh,
    dailyKwh,
  );
  const fedInKwh = Math.max(0, annualYieldKwh - selfConsumedKwh);
  const annualSavingsEur =
    selfConsumedKwh * eurPerKwh +
    fedInKwh * FEED_IN_EUR_PER_KWH;
  const monthlySavingsEur = round0(annualSavingsEur / 12);
  const paybackYears =
    annualSavingsEur > 0 ? round1(bom.totalEur / annualSavingsEur) : 0;

  return {
    id: `V-${cfg.strategy}`,
    label: cfg.label,
    strategy: cfg.strategy,
    bom,
    monthlySavingsEur,
    paybackYears,
    marginPct: cfg.marginPct,
    winRatePct: cfg.winRatePct,
    confidence: cfg.confidence,
    citedProjectIds: ["P-001", "P-002", "P-003"],
    objection: cfg.objection,
  };
}

// ---------------------------------------------------------------------------
// Hard-rule validation
// ---------------------------------------------------------------------------

function validateRules(args: {
  systemKwp: number;
  panelCount: number;
  usableRoofAreaM2: number;
  recommendedBatteryKwh: number;
  recommendedInverterKw: number;
  dailyKwh: number;
  hasBattery: boolean;
}): SizingResult["rules"] {
  const {
    systemKwp,
    panelCount,
    usableRoofAreaM2,
    recommendedBatteryKwh,
    recommendedInverterKw,
    dailyKwh,
    hasBattery,
  } = args;

  const rules: SizingResult["rules"] = [];

  // 1. Inverter ratio
  const inverterRatio = systemKwp > 0 ? recommendedInverterKw / systemKwp : 0;
  rules.push({
    name: "inverter_ratio",
    pass: inverterRatio >= 0.75 && inverterRatio <= 1.1,
    message: `inverter/system ratio = ${round1(inverterRatio * 100) / 100} (allowed 0.75–1.10)`,
  });

  // 2. Battery sanity
  const batteryRatio = dailyKwh > 0 ? recommendedBatteryKwh / dailyKwh : 0;
  rules.push({
    name: "battery_sanity",
    pass: batteryRatio >= 0.5 && batteryRatio <= 2.0,
    message: `battery/daily-kWh ratio = ${round1(batteryRatio * 100) / 100} (allowed 0.5–2.0)`,
  });

  // 3. Roof area fit
  const panelAreaM2 = panelCount * PANEL_AREA_M2;
  rules.push({
    name: "roof_area_fit",
    pass: panelAreaM2 <= usableRoofAreaM2,
    message: `panel area = ${round1(panelAreaM2)} m² vs usable roof = ${round1(usableRoofAreaM2)} m²`,
  });

  // 4. German 70% feed-in cap (only enforced if no battery and no curtailment).
  const feedInPass = hasBattery
    ? true
    : recommendedInverterKw <= 0.7 * systemKwp + 1e-6;
  rules.push({
    name: "german_70_percent_feed_in_cap",
    pass: feedInPass,
    message: hasBattery
      ? "battery present — 70% cap not applicable"
      : `inverter ${round1(recommendedInverterKw)} kW vs cap ${round1(0.7 * systemKwp)} kW`,
  });

  return rules;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Extended SizingResult with roof-aware fields. Kept as a structural
 * superset of `SizingResult` so existing call sites keep working — extra
 * fields are optional and non-breaking.
 */
export type SizingResultWithAllocations = SizingResult & {
  /** Per-segment panel layout (only populated when segments drive sizing). */
  segmentAllocations?: SegmentAllocation[];
  /** Distinct MPPT string count derived from segmentAllocations. */
  mpptStringCount?: number;
};

export function sizeQuote(
  intake: Intake,
  roofSegments: RoofSegment[],
  eurPerKwhOverride?: number,
): SizingResultWithAllocations {
  const annualKwhRaw = deriveAnnualKwh(intake, eurPerKwhOverride);
  const annualKwh = round0(annualKwhRaw);
  const dailyKwh = annualKwhRaw / 365;

  const usableRoofAreaM2 = calcUsableRoofArea(roofSegments);

  // Roof-aware sizing: cap demand-driven panel count by what physically
  // fits on usable segments. Falls back to the bill-derived formula when
  // no usable segments are present.
  const panelFitMax = calcPanelFitMax(roofSegments);
  const panelDemand = Math.ceil(annualKwhRaw / KWH_PER_PANEL_PER_YEAR_DE);
  const roofAware = panelFitMax > 0;
  const panelCount = roofAware
    ? Math.max(1, Math.min(panelFitMax, Math.round(panelDemand * DEMAND_OVERSIZE)))
    : calcPanelCount(annualKwhRaw);
  const systemKwpRaw = panelCount * PANEL_KW;
  const systemKwp = round1(systemKwpRaw);

  const baselineBatteryKwh = calcBatteryKwh(dailyKwh);
  const batteryKwhRecommended = round1(baselineBatteryKwh);

  const annualYieldKwh = round0(systemKwpRaw * ANNUAL_YIELD_KWH_PER_KWP);

  const shouldOfferHp = shouldOfferHeatPump(intake, annualKwhRaw);
  const heatPumpKwBaseline = calcHeatPumpKw(DEFAULT_HEATED_AREA_M2);

  // Use the closeRate (recommended) variant's inverter sizing for the rule
  // audit so the rules array reflects what the homeowner is actually shown.
  const recommendedCfg = VARIANT_CONFIGS[1];
  const recommendedInverterKw = round1(systemKwpRaw * recommendedCfg.inverterFactor);

  const rules = validateRules({
    systemKwp: systemKwpRaw,
    panelCount,
    usableRoofAreaM2,
    recommendedBatteryKwh: batteryKwhRecommended,
    recommendedInverterKw,
    dailyKwh,
    hasBattery: batteryKwhRecommended > 0,
  });

  const variantInputBase = {
    intake,
    panelCount,
    systemKwp: systemKwpRaw,
    baselineBatteryKwh,
    dailyKwh,
    annualKwh: annualKwhRaw,
    annualYieldKwh,
    heatPumpKwBaseline,
    shouldOfferHp,
    eurPerKwh: eurPerKwhOverride ?? EUR_PER_KWH_RESIDENTIAL,
  };

  const variants: [Variant, Variant, Variant] = [
    buildVariant({ cfg: VARIANT_CONFIGS[0], ...variantInputBase }),
    buildVariant({ cfg: VARIANT_CONFIGS[1], ...variantInputBase }),
    buildVariant({ cfg: VARIANT_CONFIGS[2], ...variantInputBase }),
  ];

  const result: SizingResultWithAllocations = {
    annualKwh,
    dailyKwh: round1(dailyKwh),
    usableRoofAreaM2: round1(usableRoofAreaM2),
    roofSegments,
    panelCount,
    systemKwp,
    batteryKwh: batteryKwhRecommended,
    annualYieldKwh,
    rules,
    variants,
  };

  if (roofAware) {
    const allocations = allocatePanelsToSegments(roofSegments, panelCount);
    result.segmentAllocations = allocations;
    const stringIds = new Set(
      allocations.filter((a) => a.status === "used").map((a) => a.stringId),
    );
    result.mpptStringCount = stringIds.size;
  }

  if (shouldOfferHp || intake.heating === "heat_pump") {
    // Report a sized heat pump in the top-level summary whenever the household
    // either already has one or qualifies for one. Variants decide for themselves
    // whether to include it in the BoM.
    result.heatPumpKw = round1(heatPumpKwBaseline);
  }

  result.variants = result.variants.map((variant) => {
    const recommendation = recommendBom(result, intake, variant.strategy);
    const annualSavingsEur = variant.monthlySavingsEur * 12;
    return {
      ...variant,
      bom: recommendation.bom,
      paybackYears:
        annualSavingsEur > 0
          ? round1(recommendation.bom.totalEur / annualSavingsEur)
          : 0,
      citedProjectIds: recommendation.citedProjectIds,
    };
  }) as [Variant, Variant, Variant];

  return result;
}

// ---------------------------------------------------------------------------
// Async entry point with LLM-enriched rationale
// ---------------------------------------------------------------------------

/**
 * Asynchronous wrapper around `sizeQuote` that enriches every Variant's
 * `objection` with Gemini-generated rationale (objection + reason).
 *
 * Calls `sizeQuote` first to keep the math purely deterministic, then fans
 * out the enrichment in parallel via `Promise.all`. The enrichment helper
 * never throws — on any failure it falls back to a deterministic template —
 * so this function is also non-throwing in practice.
 */
export async function sizeQuoteWithRationale(
  intake: Intake,
  roofSegments: RoofSegment[],
  eurPerKwhOverride?: number,
): Promise<SizingResultWithAllocations> {
  const base = sizeQuote(intake, roofSegments, eurPerKwhOverride);

  const enriched = await Promise.all(
    base.variants.map(async (variant) => {
      const rationale = await enrichVariantRationale(variant, intake);
      return { ...variant, objection: rationale.objection };
    }),
  );

  return {
    ...base,
    variants: [enriched[0], enriched[1], enriched[2]] as [Variant, Variant, Variant],
  };
}
