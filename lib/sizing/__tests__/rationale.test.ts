// lib/sizing/__tests__/rationale.test.ts
// Tests for the Gemini Rationale Agent. We mock @/lib/api/gemini and exercise
// three scenarios:
//
//   1. Gemini returns a valid response  → enrichVariantRationale forwards it.
//   2. Gemini wrapper reports apiStatus.status === "error"  → deterministic
//      template is returned.
//   3. Same inputs + same mock          → deterministic, byte-identical output.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Intake, Variant } from "@/lib/contracts";

vi.mock("@/lib/api/gemini", () => ({
  callGeminiStructured: vi.fn(),
}));

import { callGeminiStructured } from "@/lib/api/gemini";
import { enrichVariantRationale } from "@/lib/sizing/rationale";

const mockedCallGemini = vi.mocked(callGeminiStructured);

const VARIANT: Variant = {
  id: "V-margin",
  label: "Best Margin",
  strategy: "margin",
  bom: {
    panels: { brand: "Huawei", model: "LUNA-440", count: 14, wp: 440 },
    inverter: { brand: "Huawei", model: "SUN2000-KTL", kw: 6.0 },
    battery: { brand: "EcoFlow", model: "PowerOcean", kwh: 6.0 },
    totalEur: 14500,
  },
  monthlySavingsEur: 95,
  paybackYears: 12.7,
  marginPct: 31,
  winRatePct: 38,
  confidence: 0.72,
  citedProjectIds: ["P-101", "P-202", "P-303"],
  objection: "placeholder",
};

const INTAKE: Intake = {
  address: "Unter den Linden 1, 10117 Berlin",
  lat: 52.5163,
  lng: 13.3777,
  monthlyBillEur: 130,
  annualKwh: 5200,
  ev: false,
  heating: "gas",
  goal: "lower_bill",
};

beforeEach(() => {
  mockedCallGemini.mockReset();
});

describe("enrichVariantRationale", () => {
  it("returns the LLM rationale when Gemini reports apiStatus.status === \"ok\"", async () => {
    const llmResponse = {
      objection: "Risk: Huawei battery brand may not match the homeowner's expectation for premium.",
      reason: "Cited from Reonic projects P-101, P-202, P-303 with comparable 5,200 kWh demand.",
    };
    mockedCallGemini.mockResolvedValueOnce({
      data: llmResponse,
      apiStatus: { source: "live", status: "ok", latencyMs: 320 },
    });

    const out = await enrichVariantRationale(VARIANT, INTAKE);

    expect(mockedCallGemini).toHaveBeenCalledTimes(1);
    expect(out).toEqual(llmResponse);
  });

  it("returns the deterministic template when Gemini reports apiStatus.status === \"error\"", async () => {
    mockedCallGemini.mockResolvedValueOnce({
      data: null,
      apiStatus: { source: "cached", status: "error", latencyMs: 50, message: "boom" },
    });

    const out = await enrichVariantRationale(VARIANT, INTAKE);

    expect(out.objection).toBe(
      "Risk: battery brand preference may differ; counter with project #P-101.",
    );
    expect(out.reason).toBe(
      "Cited from Reonic projects #P-101, #P-202, #P-303 in similar households.",
    );
  });

  it("returns the deterministic template when Gemini reports apiStatus.status === \"timeout\"", async () => {
    mockedCallGemini.mockResolvedValueOnce({
      data: null,
      apiStatus: { source: "cached", status: "timeout", latencyMs: 4000, message: "Timed out" },
    });

    const out = await enrichVariantRationale(VARIANT, INTAKE);

    expect(out.objection).toMatch(/^Risk: /);
    expect(out.reason).toContain("P-101");
  });

  it("uses an LTV-flavoured fallback when the LTV variant fails", async () => {
    mockedCallGemini.mockResolvedValueOnce({
      data: null,
      apiStatus: { source: "cached", status: "error", latencyMs: 10 },
    });

    const ltvVariant: Variant = {
      ...VARIANT,
      id: "V-ltv",
      label: "Best LTV",
      strategy: "ltv",
    };

    const out = await enrichVariantRationale(ltvVariant, INTAKE);

    expect(out.objection).toContain("premium price may stall the homeowner");
    expect(out.objection).toContain("P-101");
  });

  it("never throws when the underlying Gemini call rejects", async () => {
    mockedCallGemini.mockRejectedValueOnce(new Error("network exploded"));

    const out = await enrichVariantRationale(VARIANT, INTAKE);

    expect(out.objection).toMatch(/^Risk: /);
    expect(out.reason).toContain("Reonic projects");
  });

  it("is deterministic: same inputs + same mock = identical output", async () => {
    const llmResponse = {
      objection: "Risk: total €14,500 may cause sticker shock for a 5,200 kWh household.",
      reason: "Cited from Reonic projects P-101 and P-202 with identical configurations.",
    };
    mockedCallGemini.mockResolvedValue({
      data: llmResponse,
      apiStatus: { source: "live", status: "ok", latencyMs: 280 },
    });

    const a = await enrichVariantRationale(VARIANT, INTAKE);
    const b = await enrichVariantRationale(VARIANT, INTAKE);

    expect(a).toEqual(b);
    expect(a).toEqual(llmResponse);
  });
});
