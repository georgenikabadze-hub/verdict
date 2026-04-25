import { describe, expect, it } from "vitest";
import { recommendBom } from "@/lib/reonic/recommend";
import type { Intake, RoofSegment, SizingResult, Strategy } from "@/lib/contracts";

const intake: Intake = {
  address: "Leopoldstraße 100, 80802 München",
  lat: 48.16,
  lng: 11.585,
  monthlyBillEur: 0,
  annualKwh: 8500,
  ev: true,
  heating: "oil",
  goal: "lower_bill",
};

const roofSegments: RoofSegment[] = [
  {
    pitchDegrees: 30,
    azimuthDegrees: 225,
    areaMeters2: 80,
    annualSunshineHours: 1180,
  },
];

const sizing: SizingResult = {
  annualKwh: 8500,
  dailyKwh: 23.3,
  usableRoofAreaM2: 80,
  roofSegments,
  panelCount: 22,
  systemKwp: 9.7,
  batteryKwh: 13,
  heatPumpKw: 13.2,
  annualYieldKwh: 9196,
  rules: [],
  variants: [] as unknown as SizingResult["variants"],
};

const strategies: Strategy[] = ["margin", "closeRate", "ltv"];

describe("recommendBom", () => {
  it("returns a priced BoM for each strategy", () => {
    for (const strategy of strategies) {
      const recommendation = recommendBom(sizing, intake, strategy);

      expect(recommendation.bom.totalEur).toBeGreaterThan(0);
      expect(recommendation.bom.panels.count).toBe(sizing.panelCount);
      expect(recommendation.bom.inverter.kw).toBe(sizing.systemKwp);
    }
  });

  it("cites exactly 3 distinct project IDs for each strategy", () => {
    for (const strategy of strategies) {
      const recommendation = recommendBom(sizing, intake, strategy);

      expect(recommendation.citedProjectIds).toHaveLength(3);
      expect(new Set(recommendation.citedProjectIds).size).toBe(3);
    }
  });

  it("is deterministic for identical inputs", () => {
    for (const strategy of strategies) {
      const first = recommendBom(sizing, intake, strategy);

      for (let i = 0; i < 100; i += 1) {
        expect(recommendBom(sizing, intake, strategy)).toEqual(first);
      }
    }
  });

  it("ltv includes a heat pump for non-heat-pump homes above 8,000 kWh", () => {
    const recommendation = recommendBom(sizing, intake, "ltv");

    expect(intake.heating).not.toBe("heat_pump");
    expect(intake.annualKwh).toBeGreaterThan(8000);
    expect(recommendation.bom.heatPump).toBeDefined();
  });
});
