// lib/sizing/__tests__/compose_from_market.test.ts
//
// Verifies the runtime market-aware composer: three-state preference
// expansion, roof-fit clamping, source-URL provenance, and catalog
// metadata pass-through.

import { describe, it, expect } from "vitest";
import catalog from "@/data/fixtures/german_market_catalog.json";
import { composeFromMarket } from "@/lib/sizing/compose-from-market";
import type { Intake, Preference, RoofSegment, Strategy } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRoof(
  areaM2 = 80,
  pitch = 30,
  azimuth = 180,
  sunshineHours = 1100,
): RoofSegment[] {
  return [
    {
      pitchDegrees: pitch,
      azimuthDegrees: azimuth,
      areaMeters2: areaM2,
      annualSunshineHours: sunshineHours,
    },
  ];
}

function makeIntake(overrides: Partial<Intake> = {}): Intake {
  return {
    address: "Hubertusbader Straße 8, 14193 Berlin",
    lat: 52.49,
    lng: 13.27,
    monthlyBillEur: 150,
    annualKwh: 5500,
    ev: false,
    heating: "gas",
    goal: "lower_bill",
    ...overrides,
  };
}

const STRATEGIES: Strategy[] = ["margin", "closeRate", "ltv"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcPanelFitMax(segments: RoofSegment[]): number {
  // Mirror of lib/sizing/calculate.ts internals — small enough to inline so
  // the test doesn't reach into private exports.
  const PANEL_FOOTPRINT_M2 = 1.7;
  const ROOF_PACKING_FACTOR = 0.7;
  const MIN_SEGMENT_AREA_M2 = 10;
  const isUsable = (s: RoofSegment) => {
    if (s.areaMeters2 <= MIN_SEGMENT_AREA_M2) return false;
    if (s.pitchDegrees < 5) return true;
    const a = ((s.azimuthDegrees % 360) + 360) % 360;
    return a >= 90 && a <= 270;
  };
  return segments
    .filter(isUsable)
    .reduce(
      (sum, s) => sum + Math.floor((s.areaMeters2 / PANEL_FOOTPRINT_M2) * ROOF_PACKING_FACTOR),
      0,
    );
}

// ---------------------------------------------------------------------------
// Battery preference
// ---------------------------------------------------------------------------

describe("composeFromMarket — wantsBattery three-state expansion", () => {
  it("'yes' → all 3 variants have bom.battery", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsBattery: "yes" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.battery, `variant ${v.strategy} should have battery`).toBeDefined();
    }
  });

  it("'no' → no variant has bom.battery", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsBattery: "no" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.battery, `variant ${v.strategy} should NOT have battery`).toBeUndefined();
    }
  });

  it("'idk' → 2 of 3 variants have battery (margin + closeRate, NOT ltv)", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsBattery: "idk" }),
      roofSegments: makeRoof(),
    });
    const withBattery = result.variants.filter((v) => v.bom.battery);
    expect(withBattery.length).toBe(2);
    const strategies = withBattery.map((v) => v.strategy).sort();
    expect(strategies).toEqual(["closeRate", "margin"]);
    const ltv = result.variants.find((v) => v.strategy === "ltv");
    expect(ltv?.bom.battery).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Heat-pump preference
// ---------------------------------------------------------------------------

describe("composeFromMarket — wantsHeatPump three-state expansion", () => {
  it("'yes' → all 3 variants have bom.heatPump", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsHeatPump: "yes" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.heatPump, `variant ${v.strategy} should have heat pump`).toBeDefined();
    }
  });

  it("'no' → no variant has bom.heatPump", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsHeatPump: "no" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.heatPump, `variant ${v.strategy} should NOT have heat pump`).toBeUndefined();
    }
  });

  it("'idk' → only ltv has heat pump (the 'go big' variant)", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsHeatPump: "idk" }),
      roofSegments: makeRoof(),
    });
    const withHp = result.variants.filter((v) => v.bom.heatPump);
    expect(withHp.length).toBe(1);
    expect(withHp[0].strategy).toBe("ltv");
  });
});

// ---------------------------------------------------------------------------
// EV preference (evPref + legacy ev)
// ---------------------------------------------------------------------------

describe("composeFromMarket — EV three-state expansion", () => {
  it("evPref='yes' → all 3 variants have bom.wallbox", () => {
    const result = composeFromMarket({
      intake: makeIntake({ evPref: "yes" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.wallbox, `variant ${v.strategy} should have wallbox`).toBeDefined();
    }
  });

  it("evPref='no' → no variant has bom.wallbox", () => {
    const result = composeFromMarket({
      intake: makeIntake({ evPref: "no" }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.wallbox, `variant ${v.strategy} should NOT have wallbox`).toBeUndefined();
    }
  });

  it("evPref='idk' → only closeRate + ltv have wallbox", () => {
    const result = composeFromMarket({
      intake: makeIntake({ evPref: "idk" }),
      roofSegments: makeRoof(),
    });
    const withWb = result.variants.filter((v) => v.bom.wallbox);
    expect(withWb.length).toBe(2);
    const strategies = withWb.map((v) => v.strategy).sort();
    expect(strategies).toEqual(["closeRate", "ltv"]);
    const margin = result.variants.find((v) => v.strategy === "margin");
    expect(margin?.bom.wallbox).toBeUndefined();
  });

  it("legacy ev=true (no evPref) → all 3 variants have bom.wallbox", () => {
    const result = composeFromMarket({
      intake: makeIntake({ ev: true }),
      roofSegments: makeRoof(),
    });
    for (const v of result.variants) {
      expect(v.bom.wallbox, `variant ${v.strategy} should have wallbox via legacy ev`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Roof-fit cap
// ---------------------------------------------------------------------------

describe("composeFromMarket — roof-fit cap", () => {
  it("panelCount never exceeds calcPanelFitMax(segments) — small roof", () => {
    const segs = makeRoof(40); // tiny roof
    const fitMax = calcPanelFitMax(segs);
    const result = composeFromMarket({
      intake: makeIntake({ annualKwh: 12000 }), // high demand
      roofSegments: segs,
    });
    expect(result.panelCount).toBeGreaterThanOrEqual(1);
    expect(result.panelCount).toBeLessThanOrEqual(fitMax);
  });

  it("panelCount never exceeds calcPanelFitMax(segments) — medium roof", () => {
    const segs: RoofSegment[] = [
      { pitchDegrees: 35, azimuthDegrees: 180, areaMeters2: 60, annualSunshineHours: 1100 },
      { pitchDegrees: 35, azimuthDegrees: 0, areaMeters2: 60, annualSunshineHours: 1000 }, // north — skipped
    ];
    const fitMax = calcPanelFitMax(segs);
    const result = composeFromMarket({
      intake: makeIntake({ annualKwh: 9000 }),
      roofSegments: segs,
    });
    expect(result.panelCount).toBeLessThanOrEqual(fitMax);
  });
});

// ---------------------------------------------------------------------------
// Source URL provenance
// ---------------------------------------------------------------------------

describe("composeFromMarket — source URL provenance", () => {
  it("every variant has non-empty sourceUrls.panel and sourceUrls.inverter", () => {
    const result = composeFromMarket({
      intake: makeIntake({ wantsBattery: "yes", evPref: "yes", wantsHeatPump: "yes" }),
      roofSegments: makeRoof(),
    });
    expect(result.sourceUrls).toBeDefined();
    for (const strategy of STRATEGIES) {
      const urls = result.sourceUrls?.[strategy];
      expect(urls, `sourceUrls.${strategy} present`).toBeDefined();
      expect(urls?.panel, `sourceUrls.${strategy}.panel non-empty`).toBeTruthy();
      expect(urls?.panel.length).toBeGreaterThan(0);
      expect(urls?.inverter, `sourceUrls.${strategy}.inverter non-empty`).toBeTruthy();
      expect(urls?.inverter.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog metadata
// ---------------------------------------------------------------------------

describe("composeFromMarket — catalog metadata", () => {
  it("catalogScrapedAt + catalogSource are populated from the fixture", () => {
    const result = composeFromMarket({
      intake: makeIntake(),
      roofSegments: makeRoof(),
    });
    const fixture = catalog as { scrapedAt: string; source: string };
    expect(result.catalogScrapedAt).toBe(fixture.scrapedAt);
    expect(result.catalogSource).toBe(fixture.source);
  });
});

// ---------------------------------------------------------------------------
// SizingResult shape
// ---------------------------------------------------------------------------

describe("composeFromMarket — SizingResult shape", () => {
  it("returns a SizingResult with exactly 3 variants in [margin, closeRate, ltv] order", () => {
    const result = composeFromMarket({
      intake: makeIntake(),
      roofSegments: makeRoof(),
    });
    expect(result.variants.length).toBe(3);
    expect(result.variants[0].strategy).toBe("margin");
    expect(result.variants[1].strategy).toBe("closeRate");
    expect(result.variants[2].strategy).toBe("ltv");

    // Required SizingResult fields populated
    expect(result.annualKwh).toBeGreaterThan(0);
    expect(result.dailyKwh).toBeGreaterThan(0);
    expect(result.panelCount).toBeGreaterThanOrEqual(1);
    expect(result.systemKwp).toBeGreaterThan(0);
    expect(result.annualYieldKwh).toBeGreaterThan(0);
    expect(Array.isArray(result.rules)).toBe(true);

    // Each variant has BoM populated with non-empty brands and a positive total
    for (const v of result.variants) {
      expect(v.bom.panels.brand).toBeTruthy();
      expect(v.bom.panels.count).toBe(result.panelCount);
      expect(v.bom.inverter.brand).toBeTruthy();
      expect(v.bom.totalEur).toBeGreaterThan(0);
    }
  });

  // Defensive: untyped Preference passthrough should still compile and behave.
  const _typecheck: Preference = "idk";
  void _typecheck;
});
