// lib/sizing/roi-optimizer.ts
// Pure, deterministic NPV-maximizing panel-count picker.
//
// Walks N from 1 to panelFitMax and selects the count that maximises 25-year
// NPV against the provided self-consumption + feed-in economics.
//
// No async, no fetch, no Date.now(). Imports only from contracts (types) —
// constants are duplicated locally on purpose so calculate.ts is not edited.

import type { RoofSegment } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Local constants (mirrors of calculate.ts so we never modify that file)
// ---------------------------------------------------------------------------

const PANEL_WP = 440;
const KWH_PER_PANEL_PER_YEAR_DE = 410;
const FEED_IN_EUR_PER_KWH = 0.08;
const SOLAR_DAYTIME_FRACTION = 0.3;
const SELF_CONSUMPTION_TARGET = 0.8;
const PANEL_FOOTPRINT_M2 = 1.7;
const ROOF_PACKING_FACTOR = 0.7;
const MIN_SEGMENT_AREA_M2 = 10;
const NPV_HORIZON_YEARS = 25;

// ---------------------------------------------------------------------------
// Azimuth + pitch factors (must match calculate.ts so yields agree)
// ---------------------------------------------------------------------------

type AzimuthBucket = "E" | "SE" | "S" | "SW" | "W" | "N" | "flat";

const AZIMUTH_FACTOR: Record<AzimuthBucket, number> = {
  S: 1.0,
  SE: 0.94,
  SW: 0.94,
  E: 0.84,
  W: 0.84,
  flat: 0.92,
  N: 0.55,
};

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

function pitchFactor(pitch: number): number {
  if (pitch < 5) return 0.92;
  if (pitch > 50) return 0.85;
  if (pitch >= 20 && pitch <= 40) return 1.0;
  return 0.95;
}

function isUsableSegment(s: RoofSegment): boolean {
  if (s.areaMeters2 <= MIN_SEGMENT_AREA_M2) return false;
  if (s.pitchDegrees < 5) return true;
  const a = ((s.azimuthDegrees % 360) + 360) % 360;
  return a >= 90 && a <= 270;
}

function segmentCapacity(s: RoofSegment): number {
  return Math.floor((s.areaMeters2 / PANEL_FOOTPRINT_M2) * ROOF_PACKING_FACTOR);
}

function clampSunshineFactor(annualSunshineHours: number): number {
  // calibrate around 1000h → factor 1.0; clamp to a sensible band.
  const raw = annualSunshineHours / 1000;
  if (!Number.isFinite(raw)) return 1.0;
  return Math.min(1.15, Math.max(0.6, raw));
}

// ---------------------------------------------------------------------------
// Yield model — distribute panels greedily across usable segments by
// per-panel yield, mirroring allocatePanelsToSegments() in calculate.ts.
// ---------------------------------------------------------------------------

interface UsableRow {
  index: number;
  capacity: number;
  bucket: AzimuthBucket;
  pitch: number;
  sunshineFactor: number;
  perPanelYield: number;
}

function buildUsableRows(segments: RoofSegment[]): UsableRow[] {
  const rows: UsableRow[] = [];
  segments.forEach((s, i) => {
    if (!isUsableSegment(s)) return;
    const bucket = bucketAzimuth(s.azimuthDegrees, s.pitchDegrees);
    const sunshineFactor = clampSunshineFactor(s.annualSunshineHours);
    const perPanelYield =
      KWH_PER_PANEL_PER_YEAR_DE *
      AZIMUTH_FACTOR[bucket] *
      pitchFactor(s.pitchDegrees) *
      sunshineFactor;
    rows.push({
      index: i,
      capacity: segmentCapacity(s),
      bucket,
      pitch: s.pitchDegrees,
      sunshineFactor,
      perPanelYield,
    });
  });
  // Sort by per-panel yield desc; index tiebreak for determinism.
  rows.sort((a, b) => {
    if (b.perPanelYield !== a.perPanelYield) return b.perPanelYield - a.perPanelYield;
    return a.index - b.index;
  });
  return rows;
}

/**
 * Compute total expected annual yield for a given panel count, distributing
 * greedily across usable roof segments by per-panel yield.
 */
function annualYieldForPanelCount(rows: UsableRow[], panelCount: number): number {
  let remaining = Math.max(0, Math.floor(panelCount));
  let total = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.capacity, remaining);
    total += take * row.perPanelYield;
    remaining -= take;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Self-consumption (mirrors calcSelfConsumedKwh in calculate.ts)
// ---------------------------------------------------------------------------

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

// Re-export for tests / callers that want the same battery-target maths.
export function defaultBatteryKwhTarget(dailyKwh: number): number {
  return dailyKwh * SELF_CONSUMPTION_TARGET * (1 - SOLAR_DAYTIME_FRACTION);
}

// ---------------------------------------------------------------------------
// Public optimiser
// ---------------------------------------------------------------------------

export interface RoiOptimizerArgs {
  panelFitMax: number;
  segments: RoofSegment[];
  annualKwh: number;
  dailyKwh: number;
  batteryKwh: number;
  eurPerKwh: number;
  /** € per installed watt — applied to total installed capacity (panels × Wp). */
  eurPerWattInstalled: number;
  batteryEurPerKwh: number;
}

export interface RoiOptimizerResult {
  panelCount: number;
  npvEur25yr: number;
  marginalPaybackYears: number;
}

/**
 * Pick the panel count N ∈ [1, panelFitMax] that maximises 25-year NPV:
 *
 *   NPV(N) = [selfConsumed(N) × eurPerKwh + exported(N) × FEED_IN_EUR_PER_KWH] × 25
 *            − [N × PANEL_WP × eurPerWattInstalled + batteryKwh × batteryEurPerKwh]
 *
 * If every N produces negative NPV, returns N=1 (degenerate but bounded —
 * the caller can still surface that this roof is uneconomic).
 *
 * Marginal payback for N>=2 is (totalCost(N) − totalCost(N−1)) / annualMarginalSavings.
 * For N=1 the marginal payback is panel-1 payback against the full installed cost.
 */
export function optimizePanelCountForRoi(args: RoiOptimizerArgs): RoiOptimizerResult {
  const {
    panelFitMax,
    segments,
    annualKwh,
    dailyKwh,
    batteryKwh,
    eurPerKwh,
    eurPerWattInstalled,
    batteryEurPerKwh,
  } = args;

  const fitMax = Math.max(1, Math.floor(panelFitMax));
  const rows = buildUsableRows(segments);

  const fixedBatteryCost = Math.max(0, batteryKwh) * Math.max(0, batteryEurPerKwh);

  const cost = (n: number): number => n * PANEL_WP * eurPerWattInstalled + fixedBatteryCost;

  const annualSavings = (n: number): number => {
    const yieldKwh = annualYieldForPanelCount(rows, n);
    const selfConsumed = calcSelfConsumedKwh(annualKwh, yieldKwh, batteryKwh, dailyKwh);
    const exported = Math.max(0, yieldKwh - selfConsumed);
    return selfConsumed * eurPerKwh + exported * FEED_IN_EUR_PER_KWH;
  };

  const npv = (n: number): number => annualSavings(n) * NPV_HORIZON_YEARS - cost(n);

  let bestN = 1;
  let bestNpv = -Infinity;
  for (let n = 1; n <= fitMax; n += 1) {
    const v = npv(n);
    if (v > bestNpv) {
      bestNpv = v;
      bestN = n;
    }
  }

  // Marginal payback for the chosen N.
  let marginalPaybackYears = 0;
  if (bestN <= 1) {
    const s1 = annualSavings(1);
    marginalPaybackYears = s1 > 0 ? cost(1) / s1 : 0;
  } else {
    const marginalCost = cost(bestN) - cost(bestN - 1);
    const marginalSavings = annualSavings(bestN) - annualSavings(bestN - 1);
    marginalPaybackYears = marginalSavings > 0 ? marginalCost / marginalSavings : 0;
  }

  return {
    panelCount: bestN,
    npvEur25yr: bestNpv === -Infinity ? 0 : bestNpv,
    marginalPaybackYears,
  };
}
