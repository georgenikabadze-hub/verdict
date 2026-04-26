/**
 * scripts/scrape-catalog.ts
 *
 * One-time scrape of the German residential solar market via Tavily +
 * Gemini, writing a structured catalog to data/fixtures/german_market_catalog.json.
 *
 * Runtime never calls Tavily directly — it reads this fixture. Re-run with:
 *   pnpm tsx scripts/scrape-catalog.ts
 *
 * Six categories: panels, inverters, batteries, wallboxes, heat pumps, mounts.
 * Each Tavily snippet is parsed by Gemini into a small Zod-validated object
 * with brand / model / specs / price / source URL. Hand-written canonical
 * entries backstop any category Gemini can't extract from.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// -------------------------------------------------------------------------
// Env loading (no dotenv dep — read .env.local directly)
// -------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function loadEnv(): { tavily: string; gemini: string } {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const raw = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY missing from .env.local");
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing from .env.local");
  return { tavily: env.TAVILY_API_KEY, gemini: env.GEMINI_API_KEY };
}

const { tavily: TAVILY_KEY, gemini: GEMINI_KEY } = loadEnv();

// -------------------------------------------------------------------------
// Categories + Tavily queries
// -------------------------------------------------------------------------

type Category = "panels" | "inverters" | "batteries" | "wallboxes" | "heatPumps" | "mounts";

const QUERIES: Record<Category, string> = {
  panels:    "440W solar panel Germany 2026 price brand model Huawei Meyer Burger Longi Trina",
  inverters: "hybrid solar inverter 5kW 10kW Germany 2026 price SMA Huawei Sungrow Fronius",
  batteries: "home battery storage 10kWh 15kWh Germany 2026 price BYD Tesla Powerwall Sonnen",
  wallboxes: "11kW wallbox EV charger Germany 2026 price go-e KEBA Wallbox eMH3",
  heatPumps: "air water heat pump 8kW 12kW Germany 2026 price Vaillant Viessmann Daikin",
  mounts:    "PV mounting system tiled roof Germany 2026 price K2 Schletter IBC",
};

// -------------------------------------------------------------------------
// Tavily client — POST https://api.tavily.com/search
// -------------------------------------------------------------------------

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query,
      search_depth: "basic",
      max_results: 6,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

// -------------------------------------------------------------------------
// Gemini client — extract structured catalog entries from raw snippets
// -------------------------------------------------------------------------

interface CatalogItem {
  brand: string;
  model: string;
  /** kW for inverters / wallboxes / heat pumps */
  kw?: number;
  /** kWh for batteries */
  kwh?: number;
  /** Wp for panels */
  wp?: number;
  eurEx: number;
  currency: "EUR";
  sourceUrl: string;
  sourceTitle: string;
}

const SCHEMA_HINTS: Record<Category, string> = {
  panels:    "wp (in watt-peak) and eurEx (price per panel in EUR ex VAT)",
  inverters: "kw (rated AC kW) and eurEx (price per unit in EUR ex VAT)",
  batteries: "kwh (usable kWh) and eurEx (price per unit in EUR ex VAT)",
  wallboxes: "kw (charging kW, usually 11) and eurEx (price per unit in EUR ex VAT)",
  heatPumps: "kw (heating kW output) and eurEx (price per unit in EUR ex VAT)",
  mounts:    "eurEx (price per panel mounting kit in EUR ex VAT)",
};

async function geminiExtract(category: Category, raw: TavilyResult[]): Promise<CatalogItem[]> {
  const snippetText = raw
    .map((r, i) => `[${i + 1}] TITLE: ${r.title}\nURL: ${r.url}\nSNIPPET: ${r.content.slice(0, 600)}`)
    .join("\n\n");

  const prompt = `You are extracting solar-industry product listings from web search snippets.

Category: ${category}
Required fields per item: brand, model, ${SCHEMA_HINTS[category]}, sourceUrl, sourceTitle.

From the snippets below, extract up to 4 distinct products you are confident about. Skip anything ambiguous. Use realistic German market prices (EUR, ex VAT, residential single-unit). The sourceUrl MUST be one of the URLs from the snippets — do not invent URLs.

Return ONLY a JSON array, no prose, no code fences. Example shape:
[{"brand":"Huawei","model":"LUNA-440","wp":440,"eurEx":160,"currency":"EUR","sourceUrl":"https://...","sourceTitle":"..."}]

Snippets:
${snippetText}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn(`[${category}] gemini returned non-JSON, skipping. Raw:`, text.slice(0, 200));
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (it): it is CatalogItem =>
        typeof it === "object" &&
        it !== null &&
        typeof (it as CatalogItem).brand === "string" &&
        typeof (it as CatalogItem).model === "string" &&
        typeof (it as CatalogItem).eurEx === "number" &&
        typeof (it as CatalogItem).sourceUrl === "string",
    )
    .map((it) => ({ ...it, currency: "EUR" as const }));
}

// -------------------------------------------------------------------------
// Hand-written backstop catalog (used when Gemini extraction is empty)
// -------------------------------------------------------------------------

const FALLBACK: Record<Category, CatalogItem[]> = {
  panels: [
    { brand: "Huawei",        model: "LUNA-440",            wp: 440, eurEx: 155, currency: "EUR", sourceUrl: "https://solar.huawei.com/", sourceTitle: "Huawei Solar EU" },
    { brand: "Meyer Burger",  model: "Black 400",           wp: 400, eurEx: 230, currency: "EUR", sourceUrl: "https://www.meyerburger.com/", sourceTitle: "Meyer Burger" },
    { brand: "Longi",         model: "Hi-MO 6 Explorer 440",wp: 440, eurEx: 145, currency: "EUR", sourceUrl: "https://www.longi.com/", sourceTitle: "Longi Solar" },
    { brand: "Trina Solar",   model: "Vertex S+ 440",       wp: 440, eurEx: 150, currency: "EUR", sourceUrl: "https://www.trinasolar.com/", sourceTitle: "Trina Solar" },
  ],
  inverters: [
    { brand: "SMA",      model: "Sunny Tripower X 12",  kw: 12, eurEx: 2400, currency: "EUR", sourceUrl: "https://www.sma.de/", sourceTitle: "SMA Solar Technology" },
    { brand: "Huawei",   model: "SUN2000-10KTL-M1",     kw: 10, eurEx: 1800, currency: "EUR", sourceUrl: "https://solar.huawei.com/", sourceTitle: "Huawei Solar EU" },
    { brand: "Sungrow",  model: "SH10RT",               kw: 10, eurEx: 1900, currency: "EUR", sourceUrl: "https://en.sungrowpower.com/", sourceTitle: "Sungrow" },
    { brand: "Fronius",  model: "Symo GEN24 10.0 Plus", kw: 10, eurEx: 2600, currency: "EUR", sourceUrl: "https://www.fronius.com/", sourceTitle: "Fronius" },
  ],
  batteries: [
    { brand: "BYD",      model: "Battery-Box Premium HVS 10.2", kwh: 10.2, eurEx: 6500, currency: "EUR", sourceUrl: "https://www.byd.com/de", sourceTitle: "BYD Battery-Box" },
    { brand: "Tesla",    model: "Powerwall 3",                  kwh: 13.5, eurEx: 9500, currency: "EUR", sourceUrl: "https://www.tesla.com/de_de/powerwall", sourceTitle: "Tesla Powerwall" },
    { brand: "Sonnen",   model: "sonnenBatterie 10 / 11 kWh",   kwh: 11.0, eurEx: 9800, currency: "EUR", sourceUrl: "https://sonnen.de/", sourceTitle: "sonnen" },
    { brand: "EcoFlow",  model: "PowerOcean 10 kWh",            kwh: 10.0, eurEx: 5500, currency: "EUR", sourceUrl: "https://de.ecoflow.com/", sourceTitle: "EcoFlow PowerOcean" },
  ],
  wallboxes: [
    { brand: "go-e",      model: "Charger Gemini 22 kW", kw: 11, eurEx: 850,  currency: "EUR", sourceUrl: "https://go-e.com/de-de/", sourceTitle: "go-e Charger" },
    { brand: "KEBA",      model: "KeContact P30 x-series", kw: 11, eurEx: 1100, currency: "EUR", sourceUrl: "https://www.keba.com/de/emobility/", sourceTitle: "KEBA KeContact" },
    { brand: "Wallbox",   model: "Pulsar Plus",          kw: 11, eurEx: 750,  currency: "EUR", sourceUrl: "https://wallbox.com/de_de/", sourceTitle: "Wallbox Pulsar" },
    { brand: "ABL",       model: "eMH3",                 kw: 11, eurEx: 1200, currency: "EUR", sourceUrl: "https://www.abl.de/", sourceTitle: "ABL eMH3" },
  ],
  heatPumps: [
    { brand: "Vaillant",   model: "aroTHERM plus VWL 105/6", kw: 10, eurEx: 14500, currency: "EUR", sourceUrl: "https://www.vaillant.de/heizung/produkte/aerotherm-plus/", sourceTitle: "Vaillant aroTHERM plus" },
    { brand: "Viessmann",  model: "Vitocal 250-A",           kw: 10, eurEx: 16500, currency: "EUR", sourceUrl: "https://www.viessmann.de/", sourceTitle: "Viessmann Vitocal" },
    { brand: "Daikin",     model: "Altherma 3 H HT 12kW",    kw: 12, eurEx: 15800, currency: "EUR", sourceUrl: "https://www.daikin.de/", sourceTitle: "Daikin Altherma" },
  ],
  mounts: [
    { brand: "K2 Systems", model: "CrossRail tiled roof",   eurEx: 65, currency: "EUR", sourceUrl: "https://k2-systems.com/de/", sourceTitle: "K2 Systems CrossRail" },
    { brand: "Schletter",  model: "Rapid 2+ tiled roof",    eurEx: 70, currency: "EUR", sourceUrl: "https://www.schletter-group.com/de/", sourceTitle: "Schletter Rapid 2+" },
    { brand: "IBC SOLAR",  model: "TopFix 200 tiled roof",  eurEx: 60, currency: "EUR", sourceUrl: "https://www.ibc-solar.de/", sourceTitle: "IBC TopFix 200" },
  ],
};

// -------------------------------------------------------------------------
// Drive
// -------------------------------------------------------------------------

interface MarketCatalog {
  scrapedAt: string;
  source: "tavily+gemini" | "tavily+gemini+fallback" | "fallback";
  panels: CatalogItem[];
  inverters: CatalogItem[];
  batteries: CatalogItem[];
  wallboxes: CatalogItem[];
  heatPumps: CatalogItem[];
  mounts: CatalogItem[];
}

async function scrapeCategory(cat: Category): Promise<{ items: CatalogItem[]; usedFallback: boolean }> {
  try {
    const raw = await tavilySearch(QUERIES[cat]);
    console.log(`[${cat}] tavily returned ${raw.length} results`);
    if (raw.length === 0) {
      return { items: FALLBACK[cat], usedFallback: true };
    }
    const items = await geminiExtract(cat, raw);
    console.log(`[${cat}] gemini extracted ${items.length} items`);
    if (items.length < 2) {
      console.log(`[${cat}] too few items, merging with fallback`);
      const merged = [...items];
      for (const fb of FALLBACK[cat]) {
        if (!merged.some((m) => m.brand === fb.brand && m.model === fb.model)) merged.push(fb);
      }
      return { items: merged.slice(0, 5), usedFallback: true };
    }
    return { items: items.slice(0, 5), usedFallback: false };
  } catch (err) {
    console.warn(`[${cat}] failed: ${(err as Error).message}; using fallback`);
    return { items: FALLBACK[cat], usedFallback: true };
  }
}

async function main() {
  console.log("scraping german solar market via tavily + gemini...");
  const cats: Category[] = ["panels", "inverters", "batteries", "wallboxes", "heatPumps", "mounts"];
  const results = await Promise.all(cats.map(async (c) => [c, await scrapeCategory(c)] as const));

  const anyFallback = results.some(([, r]) => r.usedFallback);
  const allFallback = results.every(([, r]) => r.usedFallback);

  const catalog: MarketCatalog = {
    scrapedAt: new Date().toISOString(),
    source: allFallback ? "fallback" : anyFallback ? "tavily+gemini+fallback" : "tavily+gemini",
    panels:    [],
    inverters: [],
    batteries: [],
    wallboxes: [],
    heatPumps: [],
    mounts:    [],
  };
  for (const [cat, { items }] of results) (catalog as unknown as Record<string, unknown>)[cat] = items;

  const out = resolve(REPO_ROOT, "data/fixtures/german_market_catalog.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(catalog, null, 2));
  console.log(`\nwrote ${out}`);
  console.log(`source: ${catalog.source}`);
  for (const cat of cats) {
    console.log(`  ${cat}: ${(catalog as unknown as Record<string, unknown[]>)[cat].length} items`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
