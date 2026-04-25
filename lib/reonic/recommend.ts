import projectsData from "@/data/fixtures/projects.json";
import lineItemsData from "@/data/fixtures/line_items.json";
import type { BoM, Intake, SizingResult, Strategy } from "@/lib/contracts";

export interface RecommendationContext {
  bom: BoM;
  citedProjectIds: string[];
  cohortSize: number;
}

interface ProjectFixture {
  project_id: string;
  energy_demand_wh: number | null;
  load_profile: string | null;
  has_ev: boolean | null;
  has_storage: boolean | null;
  has_wallbox: boolean | null;
  heating_existing_type: string | null;
}

interface LineItemFixture {
  project_id: string;
  technology: string | null;
  component_type: string | null;
  component_name: string | null;
  component_brand: string | null;
  quantity: number | null;
  module_watt_peak: number | null;
  inverter_power_kw: number | null;
  battery_capacity_kwh: number | null;
  wb_charging_speed_kw: number | null;
  heatpump_nominal_power_kw: number | null;
}

interface ScoredProject {
  project: ProjectFixture;
  score: number;
  jaccard: number;
  strategyScore: number;
}

interface ComponentChoice {
  brand: string;
  model: string;
  wp?: number;
  kw?: number;
}

const projects = projectsData as ProjectFixture[];
const lineItems = lineItemsData as LineItemFixture[];
const TOP_K = 10;

const lineItemsByProject = new Map<string, LineItemFixture[]>();
for (const item of lineItems) {
  const existing = lineItemsByProject.get(item.project_id);
  if (existing) {
    existing.push(item);
  } else {
    lineItemsByProject.set(item.project_id, [item]);
  }
}

const round0 = (n: number): number => Math.round(n);
const round1 = (n: number): number => Math.round(n * 10) / 10;

function intakeHeatingType(intake: Intake): string {
  switch (intake.heating) {
    case "heat_pump":
      return "Heatpump";
    case "gas":
      return "Gas";
    case "oil":
      return "Oil";
    default:
      return intake.heating;
  }
}

function inferLoadProfile(intake: Intake): string {
  return intake.ev || intake.heating === "heat_pump" ? "H0" : "H0";
}

function baseScore(project: ProjectFixture, intake: Intake): number {
  let score = 0;
  const desiredStorage = true;
  const desiredWallbox = intake.ev;
  const desiredHeating = intakeHeatingType(intake);
  const annualWh =
    typeof intake.annualKwh === "number" && intake.annualKwh > 0
      ? intake.annualKwh * 1000
      : null;

  if (project.has_ev !== null && project.has_ev === intake.ev) score += 3;
  if (project.has_storage !== null && project.has_storage === desiredStorage) {
    score += 3;
  }
  if (project.has_wallbox !== null && project.has_wallbox === desiredWallbox) {
    score += 3;
  }
  if (
    project.heating_existing_type !== null &&
    project.heating_existing_type === desiredHeating
  ) {
    score += 2;
  }
  if (
    annualWh !== null &&
    project.energy_demand_wh !== null &&
    project.energy_demand_wh >= annualWh * 0.75 &&
    project.energy_demand_wh <= annualWh * 1.25
  ) {
    score += 1;
  }
  if (project.load_profile !== null && project.load_profile === inferLoadProfile(intake)) {
    score += 1;
  }

  return score;
}

function brandSet(items: LineItemFixture[]): Set<string> {
  return new Set(
    items
      .map((item) => item.component_brand?.trim())
      .filter((brand): brand is string => Boolean(brand)),
  );
}

function jaccardWithTargets(items: LineItemFixture[], targets: string[]): number {
  const brands = brandSet(items);
  const targetSet = new Set(targets);
  const union = new Set([...brands, ...targetSet]);
  if (union.size === 0) return 0;

  let intersection = 0;
  for (const brand of brands) {
    if (targetSet.has(brand)) intersection += 1;
  }
  return intersection / union.size;
}

function hasBrand(items: LineItemFixture[], brand: string): boolean {
  return items.some((item) => item.component_brand === brand);
}

function hasType(items: LineItemFixture[], type: string): boolean {
  return items.some((item) => item.component_type === type);
}

function strategyTargets(strategy: Strategy): string[] {
  if (strategy === "ltv") return ["Vaillant", "BYD", "Sonnen", "Huawei"];
  if (strategy === "margin") return ["Huawei", "EcoFlow", "FoxESS"];
  return ["Huawei", "EcoFlow", "SAJ"];
}

function strategyScore(strategy: Strategy, items: LineItemFixture[]): number {
  if (strategy === "margin") {
    return (
      (hasBrand(items, "Huawei") ? 2 : 0) +
      (hasBrand(items, "EcoFlow") ? 2 : 0) +
      (hasBrand(items, "FoxESS") ? 2 : 0)
    );
  }

  if (strategy === "ltv") {
    return (
      (hasBrand(items, "Vaillant") || hasType(items, "Heatpump") ? 3 : 0) +
      (hasBrand(items, "BYD") || hasBrand(items, "Sonnen") ? 2 : 0) +
      (hasType(items, "BatteryStorage") ? 1 : 0)
    );
  }

  return 0;
}

function scoreProjects(intake: Intake, strategy: Strategy): ScoredProject[] {
  const targets = strategyTargets(strategy);

  return projects
    .map((project) => {
      const items = lineItemsByProject.get(project.project_id) ?? [];
      return {
        project,
        score: baseScore(project, intake),
        jaccard: jaccardWithTargets(items, targets),
        strategyScore: strategyScore(strategy, items),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.strategyScore !== a.strategyScore) return b.strategyScore - a.strategyScore;
      if (b.jaccard !== a.jaccard) return b.jaccard - a.jaccard;
      return a.project.project_id.localeCompare(b.project.project_id);
    });
}

function componentMatches(item: LineItemFixture, kind: keyof BoM): boolean {
  const type = item.component_type ?? "";
  const name = item.component_name?.toLowerCase() ?? "";
  const technology = item.technology ?? "";

  if (kind === "panels") return type === "Module" || name.includes("pv module");
  if (kind === "inverter") return type === "Inverter" || name.includes("inverter");
  if (kind === "battery") return type === "BatteryStorage" || name.includes("battery");
  if (kind === "wallbox") return type === "Wallbox" || technology === "wallbox";
  if (kind === "heatPump") return type === "Heatpump" || technology === "heatpump";
  return false;
}

function fallbackChoice(kind: keyof BoM, strategy: Strategy): ComponentChoice {
  if (kind === "panels") {
    return { brand: "AIKO", model: "PV Module 475W", wp: 475 };
  }
  if (kind === "inverter") {
    return strategy === "ltv"
      ? { brand: "Huawei", model: "Hybrid Inverter 12kW" }
      : { brand: "Huawei", model: "Hybrid Inverter 6kW" };
  }
  if (kind === "battery") {
    return strategy === "ltv"
      ? { brand: "Huawei", model: "Battery 15kWh" }
      : { brand: "EcoFlow", model: "Battery LFP 10kWh" };
  }
  if (kind === "wallbox") {
    return { brand: "EcoFlow", model: "Wallbox 11kW v2", kw: 11 };
  }
  return { brand: "Vaillant", model: "Heat Pump 12.5kW 400V", kw: 12.5 };
}

function chooseComponent(
  kind: keyof BoM,
  cohortItems: LineItemFixture[],
  strategy: Strategy,
): ComponentChoice {
  const counts = new Map<string, { count: number; item: LineItemFixture }>();
  const matching = cohortItems.filter((item) => componentMatches(item, kind));
  const source = matching.length > 0 ? matching : lineItems.filter((item) => componentMatches(item, kind));

  for (const item of source) {
    if (!item.component_brand || !item.component_name) continue;
    const key = `${item.component_brand}\u0000${item.component_name}`;
    const existing = counts.get(key);
    counts.set(key, {
      count: (existing?.count ?? 0) + Math.max(1, item.quantity ?? 1),
      item,
    });
  }

  const best = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aKey = `${a.item.component_brand} ${a.item.component_name}`;
    const bKey = `${b.item.component_brand} ${b.item.component_name}`;
    return aKey.localeCompare(bKey);
  })[0];

  if (!best) return fallbackChoice(kind, strategy);

  const item = best.item;
  const inferredKw =
    item.inverter_power_kw ??
    item.battery_capacity_kwh ??
    item.wb_charging_speed_kw ??
    (item.heatpump_nominal_power_kw !== null ? item.heatpump_nominal_power_kw / 1000 : undefined);

  return {
    brand: item.component_brand ?? fallbackChoice(kind, strategy).brand,
    model: item.component_name ?? fallbackChoice(kind, strategy).model,
    wp: item.module_watt_peak ?? undefined,
    kw: inferredKw ?? undefined,
  };
}

function priceBom(bom: Omit<BoM, "totalEur">, sizing: SizingResult, strategy: Strategy): number {
  const kwpRate = strategy === "margin" ? 1700 : strategy === "closeRate" ? 1800 : 2000;
  const batteryRate = strategy === "margin" ? 600 : strategy === "closeRate" ? 700 : 900;
  return round0(
    sizing.systemKwp * kwpRate +
      (bom.battery?.kwh ?? 0) * batteryRate +
      (bom.heatPump ? 18000 : 0),
  );
}

function buildBom(
  sizing: SizingResult,
  intake: Intake,
  strategy: Strategy,
  cohort: ScoredProject[],
): BoM {
  const cohortItems = cohort.flatMap(
    (entry) => lineItemsByProject.get(entry.project.project_id) ?? [],
  );
  const panel = chooseComponent("panels", cohortItems, strategy);
  const inverter = chooseComponent("inverter", cohortItems, strategy);
  const battery = chooseComponent("battery", cohortItems, strategy);
  const wallbox = chooseComponent("wallbox", cohortItems, strategy);
  const heatPump = chooseComponent("heatPump", cohortItems, strategy);

  const bomWithoutTotal: Omit<BoM, "totalEur"> = {
    panels: {
      brand: panel.brand,
      model: panel.model,
      count: sizing.panelCount,
      wp: panel.wp ?? 440,
    },
    inverter: {
      brand: inverter.brand,
      model: inverter.model,
      kw: round1(sizing.systemKwp),
    },
  };

  if (sizing.batteryKwh >= 1) {
    bomWithoutTotal.battery = {
      brand: battery.brand,
      model: battery.model,
      kwh: round1(sizing.batteryKwh),
    };
  }

  if (intake.ev) {
    bomWithoutTotal.wallbox = {
      brand: wallbox.brand,
      model: wallbox.model,
      kw: wallbox.kw ?? 11,
    };
  }

  if (sizing.heatPumpKw !== undefined) {
    bomWithoutTotal.heatPump = {
      brand: heatPump.brand,
      model: heatPump.model,
      kw: round1(sizing.heatPumpKw),
    };
  }

  return {
    ...bomWithoutTotal,
    totalEur: priceBom(bomWithoutTotal, sizing, strategy),
  };
}

export function recommendBom(
  sizing: SizingResult,
  intake: Intake,
  strategy: Strategy,
): RecommendationContext {
  const scored = scoreProjects(intake, strategy);
  const cohort = scored.slice(0, TOP_K);
  const citedProjectIds = cohort.slice(0, 3).map((entry) => entry.project.project_id);

  return {
    bom: buildBom(sizing, intake, strategy, cohort),
    citedProjectIds,
    cohortSize: cohort.length,
  };
}
