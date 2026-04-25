// FROZEN AT SAT 18:00. No changes without integration captain approval.
// Read by every workstream — keep narrow, additive only.

export type Heating = "gas" | "oil" | "district" | "heat_pump" | "electric";
export type Goal = "lower_bill" | "independence";
export type Strategy = "margin" | "closeRate" | "ltv";

export interface Intake {
  address: string;
  lat: number;
  lng: number;
  monthlyBillEur: number;
  annualKwh?: number;
  ev: boolean;
  heating: Heating;
  goal: Goal;
}

export interface BoM {
  panels: { brand: string; model: string; count: number; wp: number };
  inverter: { brand: string; model: string; kw: number };
  battery?: { brand: string; model: string; kwh: number };
  wallbox?: { brand: string; model: string; kw: number };
  heatPump?: { brand: string; model: string; kw: number };
  totalEur: number;
}

export interface Variant {
  id: string;
  label: "Best Margin" | "Best Close Rate" | "Best LTV";
  strategy: Strategy;
  bom: BoM;
  monthlySavingsEur: number;
  paybackYears: number;
  marginPct: number;
  winRatePct: number;
  /** 0..1 confidence score derived from KNN cohort size + match quality */
  confidence: number;
  /** Exactly 3 Reonic project IDs. Empty array means engine couldn't cite. */
  citedProjectIds: string[];
  /** "Risk: ..." sentence from rationale generation. */
  objection: string;
}

export interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  areaMeters2: number;
  annualSunshineHours: number;
}

export interface SizingResult {
  annualKwh: number;
  dailyKwh: number;
  usableRoofAreaM2: number;
  roofSegments: RoofSegment[];
  panelCount: number;
  systemKwp: number;
  batteryKwh: number;
  heatPumpKw?: number;
  annualYieldKwh: number;
  /** Hard-rule audit log shown in /debug. */
  rules: { name: string; pass: boolean; message: string }[];
  /** Always exactly 3, in order: margin, closeRate (recommended), ltv. */
  variants: [Variant, Variant, Variant];
}

export interface ApiStatus {
  source: "live" | "cached" | "mock";
  status: "ok" | "timeout" | "error";
  latencyMs: number;
  message?: string;
}

export interface LeadPacket {
  id: string;
  createdAt: string;
  intake: Intake;
  sizing: SizingResult;
  selectedVariantId: string;
  installerStatus: "new" | "reviewed" | "approved";
  finalVariant?: Variant;
  shareUrl: string;
}
