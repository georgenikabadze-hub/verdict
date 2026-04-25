// lib/sizing/rationale.ts
// Gemini Rationale Agent: produces real LLM-generated objection-prediction +
// reason for each Variant produced by the deterministic sizer. Replaces the
// hand-written placeholder `objection` strings on Variant.
//
// Contract:
//   - `enrichVariantRationale(variant, intake)` ALWAYS resolves — never throws.
//   - On Gemini timeout/error/validation-failure, returns a deterministic
//     template so the homeowner card never renders empty.
//   - Belt-and-suspenders 4s race on top of the Gemini wrapper's own timeout.
//
// Read alongside lib/api/gemini.ts (the wrapped REST client) and
// lib/sizing/calculate.ts (the sizer that calls into us via
// sizeQuoteWithRationale).

import { z } from "zod";
import { callGeminiStructured } from "@/lib/api/gemini";
import type { Intake, Variant } from "@/lib/contracts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const RationaleSchema = z.object({
  objection: z.string().min(20).max(200),
  reason: z.string().min(20).max(200),
});

export type Rationale = z.infer<typeof RationaleSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Belt-and-suspenders ceiling on top of the Gemini wrapper's own 4s budget. */
const RATIONALE_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Prompt + deterministic fallback
// ---------------------------------------------------------------------------

function describeBom(variant: Variant): string {
  const { bom } = variant;
  const parts: string[] = [
    `Panels: ${bom.panels.brand} ${bom.panels.model} ×${bom.panels.count} (${bom.panels.wp}Wp)`,
    `Inverter: ${bom.inverter.brand} ${bom.inverter.model} (${bom.inverter.kw}kW)`,
  ];
  if (bom.battery) {
    parts.push(`Battery: ${bom.battery.brand} ${bom.battery.model} (${bom.battery.kwh}kWh)`);
  }
  if (bom.wallbox) {
    parts.push(`Wallbox: ${bom.wallbox.brand} ${bom.wallbox.model} (${bom.wallbox.kw}kW)`);
  }
  if (bom.heatPump) {
    parts.push(`Heat pump: ${bom.heatPump.brand} ${bom.heatPump.model} (${bom.heatPump.kw}kW)`);
  }
  parts.push(`Total: €${bom.totalEur.toLocaleString("de-DE")}`);
  return parts.join("; ");
}

function describeIntake(intake: Intake): string {
  const ev = intake.ev ? "has EV" : "no EV";
  return `address ${intake.address}; monthly bill €${intake.monthlyBillEur}; heating ${intake.heating}; goal ${intake.goal}; ${ev}`;
}

function buildPrompt(variant: Variant, intake: Intake): string {
  const cited = variant.citedProjectIds.length > 0
    ? variant.citedProjectIds.join(", ")
    : "(no cohort matches)";

  return [
    "You are a senior German residential solar installer reviewing a quote variant before it goes to the homeowner.",
    "Given the BoM, the homeowner intake, and the cited Reonic projects, write:",
    "  1. `objection`: ONE sentence (under 25 words) predicting the most likely objection the homeowner will raise about THIS specific BoM. Start with \"Risk:\". Reference at least one concrete BoM detail (panel brand, inverter brand, battery brand, or total €).",
    "  2. `reason`: ONE sentence (under 25 words) defending the recommendation by naturally citing one or more of the project IDs.",
    "",
    `Variant strategy: ${variant.strategy} (label: ${variant.label}).`,
    `BoM — ${describeBom(variant)}.`,
    `Cited Reonic project IDs: ${cited}.`,
    `Homeowner intake — ${describeIntake(intake)}.`,
    "",
    "Return strict JSON: {\"objection\": string, \"reason\": string}. No markdown, no commentary.",
  ].join("\n");
}

function deterministicTemplate(variant: Variant): Rationale {
  const firstId = variant.citedProjectIds[0] ?? "P-000";
  const allIds = variant.citedProjectIds.length > 0
    ? variant.citedProjectIds.join(", #")
    : "000";

  const objectionTail =
    variant.strategy === "ltv"
      ? "premium price may stall the homeowner"
      : variant.strategy === "margin"
        ? "battery brand preference may differ"
        : "battery brand preference may differ";

  return {
    objection: `Risk: ${objectionTail}; counter with project #${firstId}.`,
    reason: `Cited from Reonic projects #${allIds} in similar households.`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Race a promise against a hard timeout, resolving with the fallback value if
 * the timer fires first. Used as a belt-and-suspenders ceiling on top of the
 * Gemini wrapper's own DEFAULT_TIMEOUT_MS.
 */
function raceWithDeadline<T>(p: Promise<T>, ms: number, onDeadline: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onDeadline()), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onDeadline());
      },
    );
  });
}

/**
 * Enrich a single Variant with LLM-generated rationale. Never throws.
 *
 * Flow:
 *   1. Build a focused prompt referencing the actual BoM, intake, and cited IDs.
 *   2. Call `callGeminiStructured` (which already enforces a 4s timeout and
 *      validates against `RationaleSchema`).
 *   3. If the wrapper reports `apiStatus.status !== "ok"` OR returns null data,
 *      fall back to the deterministic template.
 *   4. Belt-and-suspenders: race the whole thing against another 4s timer in
 *      case anything goes sideways.
 */
export async function enrichVariantRationale(
  variant: Variant,
  intake: Intake,
): Promise<Rationale> {
  const fallback = (): Rationale => deterministicTemplate(variant);

  const work = (async (): Promise<Rationale> => {
    try {
      const prompt = buildPrompt(variant, intake);
      const { data, apiStatus } = await callGeminiStructured(prompt, RationaleSchema);
      if (apiStatus.status !== "ok" || data === null) {
        return fallback();
      }
      return data;
    } catch {
      return fallback();
    }
  })();

  return raceWithDeadline(work, RATIONALE_TIMEOUT_MS, fallback);
}
