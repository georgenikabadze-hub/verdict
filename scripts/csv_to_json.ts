import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PROJECTS_CSV =
  "/Users/georgenikabadze/Downloads/2a8ba8e2/projects_status_quo.csv";
const LINE_ITEMS_CSV =
  "/Users/georgenikabadze/Downloads/2a8ba8e2/project_options_parts.csv";
const PROJECTS_JSON =
  "/Users/georgenikabadze/Desktop/verdict/data/fixtures/projects.json";
const LINE_ITEMS_JSON =
  "/Users/georgenikabadze/Desktop/verdict/data/fixtures/line_items.json";

type CsvRow = Record<string, string>;

interface NormalizedProject {
  project_id: string;
  country: string | null;
  energy_demand_wh: number | null;
  load_profile: string | null;
  has_ev: boolean | null;
  has_solar: boolean | null;
  has_storage: boolean | null;
  has_wallbox: boolean | null;
  heating_existing_type: string | null;
  house_size_sqm: number | null;
  first_signed_at: string | null;
  offer_created_at: string | null;
}

interface NormalizedLineItem {
  project_id: string;
  option_id: string | null;
  option_number: number | null;
  technology: string | null;
  line_item_function: string | null;
  component_type: string | null;
  component_name: string | null;
  component_brand: string | null;
  quantity: number | null;
  quantity_units: string | null;
  module_watt_peak: number | null;
  inverter_power_kw: number | null;
  battery_capacity_kwh: number | null;
  wb_charging_speed_kw: number | null;
  heatpump_nominal_power_kw: number | null;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  if (!headers) return [];

  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => {
      const out: CsvRow = {};
      headers.forEach((header, index) => {
        out[header] = cells[index] ?? "";
      });
      return out;
    });
}

function cleanString(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function cleanNumber(value: string | undefined): number | null {
  const clean = cleanString(value);
  if (clean === null) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function cleanBoolean(value: string | undefined): boolean | null {
  const clean = cleanString(value)?.toLowerCase();
  if (clean === undefined || clean === null) return null;
  if (clean === "true") return true;
  if (clean === "false") return false;
  return null;
}

function wattsToKw(value: string | undefined): number | null {
  const n = cleanNumber(value);
  return n === null ? null : n / 1000;
}

function normalizeProject(row: CsvRow): NormalizedProject | null {
  const projectId = cleanString(row.project_id);
  if (projectId === null) return null;

  return {
    project_id: projectId,
    country: cleanString(row.country),
    energy_demand_wh: cleanNumber(row.energy_demand_wh),
    load_profile: cleanString(row.load_profile),
    has_ev: cleanBoolean(row.has_ev),
    has_solar: cleanBoolean(row.has_solar),
    has_storage: cleanBoolean(row.has_storage),
    has_wallbox: cleanBoolean(row.has_wallbox),
    heating_existing_type: cleanString(row.heating_existing_type),
    house_size_sqm: cleanNumber(row.house_size_sqm),
    first_signed_at: cleanString(row.first_signed_at),
    offer_created_at: cleanString(row.offer_created_at),
  };
}

function normalizeLineItem(row: CsvRow): NormalizedLineItem | null {
  const projectId = cleanString(row.project_id);
  if (projectId === null) return null;

  return {
    project_id: projectId,
    option_id: cleanString(row.option_id),
    option_number: cleanNumber(row.option_number),
    technology: cleanString(row.technology),
    line_item_function: cleanString(row.line_item_function),
    component_type: cleanString(row.component_type),
    component_name: cleanString(row.component_name),
    component_brand: cleanString(row.component_brand),
    quantity: cleanNumber(row.quantity),
    quantity_units: cleanString(row.quantity_units),
    module_watt_peak: cleanNumber(row.module_watt_peak),
    inverter_power_kw: wattsToKw(row.inverter_power_kw),
    battery_capacity_kwh: wattsToKw(row.battery_capacity_kwh),
    wb_charging_speed_kw: wattsToKw(row.wb_charging_speed_kw),
    heatpump_nominal_power_kw: cleanNumber(row.heatpump_nominal_power_kw),
  };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function main(): Promise<void> {
  const [projectsText, lineItemsText] = await Promise.all([
    readFile(PROJECTS_CSV, "utf8"),
    readFile(LINE_ITEMS_CSV, "utf8"),
  ]);

  const projects = parseCsv(projectsText)
    .map(normalizeProject)
    .filter((p): p is NormalizedProject => p !== null);
  const projectIds = new Set(projects.map((p) => p.project_id));

  const lineItems = parseCsv(lineItemsText)
    .map(normalizeLineItem)
    .filter(
      (item): item is NormalizedLineItem =>
        item !== null && projectIds.has(item.project_id),
    );

  await Promise.all([
    writeJson(PROJECTS_JSON, projects),
    writeJson(LINE_ITEMS_JSON, lineItems),
  ]);

  console.log(
    `Wrote ${projects.length} projects and ${lineItems.length} line items.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
