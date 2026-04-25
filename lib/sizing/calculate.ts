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
// Core sizing
// ---------------------------------------------------------------------------

/**
 * Derive annual kWh demand from the intake. Prefers an explicit annualKwh
 * value when provided, otherwise back-derives from the monthly bill and
 * the German residential €/kWh average.
 */
function deriveAnnualKwh(intake: Intake): number {
  if (typeof intake.annualKwh === "number" && intake.annualKwh > 0) {
    return intake.annualKwh;
  }
  const annual = (intake.monthlyBillEur * 12) / EUR_PER_KWH_RESIDENTIAL;
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
    selfConsumedKwh * EUR_PER_KWH_RESIDENTIAL +
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

export function sizeQuote(
  intake: Intake,
  roofSegments: RoofSegment[],
): SizingResult {
  const annualKwhRaw = deriveAnnualKwh(intake);
  const annualKwh = round0(annualKwhRaw);
  const dailyKwh = annualKwhRaw / 365;

  const usableRoofAreaM2 = calcUsableRoofArea(roofSegments);

  const panelCount = calcPanelCount(annualKwhRaw);
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
  };

  const variants: [Variant, Variant, Variant] = [
    buildVariant({ cfg: VARIANT_CONFIGS[0], ...variantInputBase }),
    buildVariant({ cfg: VARIANT_CONFIGS[1], ...variantInputBase }),
    buildVariant({ cfg: VARIANT_CONFIGS[2], ...variantInputBase }),
  ];

  const result: SizingResult = {
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

  if (shouldOfferHp || intake.heating === "heat_pump") {
    // Report a sized heat pump in the top-level summary whenever the household
    // either already has one or qualifies for one. Variants decide for themselves
    // whether to include it in the BoM.
    result.heatPumpKw = round1(heatPumpKwBaseline);
  }

  return result;
}
