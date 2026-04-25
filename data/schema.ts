import { z } from "zod";

export const HeatingSchema = z.enum(["gas", "oil", "district", "heat_pump", "electric"]);
export const GoalSchema = z.enum(["lower_bill", "independence"]);
export const StrategySchema = z.enum(["margin", "closeRate", "ltv"]);

export const IntakeSchema = z.object({
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  monthlyBillEur: z.number().positive(),
  annualKwh: z.number().positive().optional(),
  ev: z.boolean(),
  heating: HeatingSchema,
  goal: GoalSchema,
});

export const BomSchema = z.object({
  panels: z.object({
    brand: z.string(),
    model: z.string(),
    count: z.number().int().nonnegative(),
    wp: z.number().positive(),
  }),
  inverter: z.object({
    brand: z.string(),
    model: z.string(),
    kw: z.number().positive(),
  }),
  battery: z.object({
    brand: z.string(),
    model: z.string(),
    kwh: z.number().positive(),
  }).optional(),
  wallbox: z.object({
    brand: z.string(),
    model: z.string(),
    kw: z.number().positive(),
  }).optional(),
  heatPump: z.object({
    brand: z.string(),
    model: z.string(),
    kw: z.number().positive(),
  }).optional(),
  totalEur: z.number().nonnegative(),
});

export const VariantSchema = z.object({
  id: z.string(),
  label: z.enum(["Best Margin", "Best Close Rate", "Best LTV"]),
  strategy: StrategySchema,
  bom: BomSchema,
  monthlySavingsEur: z.number(),
  paybackYears: z.number().positive(),
  marginPct: z.number(),
  winRatePct: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  citedProjectIds: z.array(z.string()).length(3),
  objection: z.string(),
});

export const RoofSegmentSchema = z.object({
  pitchDegrees: z.number(),
  azimuthDegrees: z.number(),
  areaMeters2: z.number().positive(),
  annualSunshineHours: z.number().nonnegative(),
});

export const SizingResultSchema = z.object({
  annualKwh: z.number().positive(),
  dailyKwh: z.number().positive(),
  usableRoofAreaM2: z.number().positive(),
  roofSegments: z.array(RoofSegmentSchema),
  panelCount: z.number().int().positive(),
  systemKwp: z.number().positive(),
  batteryKwh: z.number().nonnegative(),
  heatPumpKw: z.number().positive().optional(),
  annualYieldKwh: z.number().positive(),
  rules: z.array(z.object({
    name: z.string(),
    pass: z.boolean(),
    message: z.string(),
  })),
  variants: z.tuple([VariantSchema, VariantSchema, VariantSchema]),
});

export const ApiStatusSchema = z.object({
  source: z.enum(["live", "cached", "mock"]),
  status: z.enum(["ok", "timeout", "error"]),
  latencyMs: z.number().nonnegative(),
  message: z.string().optional(),
});

export const LeadPacketSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  intake: IntakeSchema,
  sizing: SizingResultSchema,
  selectedVariantId: z.string(),
  installerStatus: z.enum(["new", "reviewed", "approved"]),
  finalVariant: VariantSchema.optional(),
  shareUrl: z.string().url(),
});
