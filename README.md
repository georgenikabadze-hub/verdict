# Verdict

Verdict is an AI solar-quote intake for the Reonic track: a German homeowner enters an address, sees a live roof context, answers four questions, and gets three Reonic-grounded BoM options that an installer can accept, edit, and send back.

Live demo: https://verdict-gamma-ten.vercel.app

GitHub: https://github.com/georgenikabadze-hub/verdict

## The Reonic Challenge

Reonic already helps installers plan and sell renewable systems, but the first homeowner touchpoint is still slow, thin, and hard to qualify. A generic lead gives an installer an address and a bill; it does not give roof facts, intent, demand, or a commercially plausible BoM. The opportunity is to turn homeowner intake into a Reonic-qualified lead before the installer spends time on manual quoting.

## How Verdict Solves It

- Homeowner intake captures address, monthly bill, EV intent, heating type, and goal in one flow.
- Live address lookup plus Cesium photoreal roof context makes the quote feel tied to the real property.
- Reonic-KNN sizing grounds panels, inverter, battery, wallbox, and heat-pump options in 1,277 cleaned Reonic projects.
- Installer marketplace hides private homeowner details behind deterministic blur until the installer accepts the lead.
- AI-enriched quote cards add installer-style rationale while deterministic math keeps panel counts and kWp stable.

## Architecture

```text
Homeowner side
  /                         address + intake + Cesium roof view
  /quote                    3 variants + tariff + send-to-installer CTA
        |
        v
API + sizing
  app/api/quote             geocode -> Solar API -> Tavily tariff -> sizeQuote
  lib/sizing/calculate.ts   deterministic demand, PV, battery, savings math
  lib/reonic/recommend.ts   KNN over Reonic fixtures
  lib/sizing/rationale.ts   Gemini rationale fallback-safe enrichment
        |
        v
Lead store
  app/api/leads             create/list leads
  lib/leads/store.ts        in-memory lead records, publicPreview/privateDetails
        |
        v
Installer side
  /installer                marketplace, accept-to-unlock, offer send-back
```

## Partner Technologies Used

| Tech | Where it is used | File path |
|---|---|---|
| Google Gemini | (a) Runtime rationale generation for each quote variant. (b) Build-time structured extraction of German solar market product listings from Tavily snippets, used to populate the cached catalog. | `lib/api/gemini.ts`, `lib/sizing/rationale.ts`, `scripts/scrape-catalog.ts` |
| Tavily | (a) Runtime residential electricity tariff lookup for quote ROI, with 4s timeout and deterministic default. (b) Build-time German solar market scraping across 6 categories (panels, inverters, batteries, wallboxes, heat pumps, mounts) — see "Tavily-powered market catalog" below. | `lib/api/tavily.ts`, `app/api/quote/route.ts`, `scripts/scrape-catalog.ts`, `data/fixtures/german_market_catalog.json` |
| Google Maps Platform + CesiumJS | Runtime geocoding, Solar API roof segments, photoreal 3D roof context, and per-panel `solarPanels[]` placement consumed by the installer-side BoM composer. | `app/api/quote/route.ts`, `app/api/roof-facts/route.ts`, `components/homeowner/CesiumRoofView.tsx` |
| Lovable | Initial UI scaffold for the installer variant cards (`VariantCardLovable`). Generated via Lovable, then wired into the React tree by hand. | `components/installer/VariantCardLovable.tsx` (header comment marks Lovable provenance) |

## Tavily-powered market catalog

The installer-side bill-of-materials composer is grounded in a **cached catalog of real German solar market data**, scraped via Tavily and structured by Gemini at build time. The runtime never calls Tavily — it reads the cached fixture — so the demo is bulletproof against API outages.

**Pipeline:**

```
scripts/scrape-catalog.ts
  ├─ Tavily fan-out (6 parallel queries)
  │    panels / inverters / batteries / wallboxes / heat pumps / mounts
  │
  ├─ Gemini 2.5 Flash structured extraction (one call per category)
  │    snippet → { brand, model, kw|kwh|wp, eurEx, sourceUrl, sourceTitle }
  │
  └─ data/fixtures/german_market_catalog.json
         { scrapedAt, source, panels[], inverters[], ... }
```

**To re-scrape the catalog with current market data:**

```bash
pnpm scrape:catalog
```

(Requires `TAVILY_API_KEY` and `GEMINI_API_KEY` in `.env.local`.)

**What's in the cached catalog:**
- `scrapedAt` — ISO timestamp of the last scrape
- `source` — `"tavily+gemini"` (all categories real), `"tavily+gemini+fallback"` (some Gemini extractions empty, merged with hand-written canonicals), or `"fallback"` (no scrape data)
- One array per category, each item carrying `sourceUrl` + `sourceTitle` so the installer UI can show "this price came from {pv-magazine.com}" attribution chips per BoM line.

**How the runtime uses it:**

1. Installer opens a lead → `lib/sizing/compose-from-market.ts` reads the cached catalog
2. ROI-optimal sizer (`lib/sizing/roi-optimizer.ts`) picks the panel count that maximizes 25-year NPV given Berlin's €0.32 retail / €0.08 feed-in spread on the specific roof
3. Picks compatible inverter + battery + wallbox + heat pump from the catalog
4. Each BoM line in the installer UI shows a `SourceUrlChip` linking back to the page Tavily found it on

The "Tavily" partner-tech requirement is satisfied **twice over**: once as a runtime API (live electricity tariff lookup in `lib/api/tavily.ts`) and once as a build-time market-research pipeline driving the entire installer-side offer composition.

## Privacy Story

Verdict separates each installer lead into `publicPreview` and `privateDetails` in `lib/leads/store.ts`. The installer sees approximate district, blurred coordinates, roof facts, sizing, preferences, and BoM options first. Exact address, coordinates, name, email, and phone stay locked until the installer accepts the lead, using deterministic blur from `lib/leads/blur.ts` so the same lead stays consistently anonymized.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill `.env.local`:

```bash
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
```

Run locally:

```bash
pnpm dev
```

## Test Plan

These demo addresses were verified for parity sizing across the quote page and API endpoint:

- Hubertusbader 8, Berlin
- Diedersdorfer 3, Berlin
- Schlossstraße 70, Berlin
- Tegeler Weg 5, Berlin

Recommended checks:

```bash
pnpm tsc --noEmit
pnpm test
pnpm lint
```

## Loom Demo Script

1. Open Verdict and enter `Donaustraße 44, Berlin` or one of the verified demo addresses.
2. Show the roof context and explain that Verdict starts from the real property, not a blank survey.
3. Fill the four homeowner fields and open `/quote`.
4. Point to the three Reonic-grounded options, the live/default tariff line, and the cited installer-style objection.
5. Send the quote to the installer marketplace.
6. Open `/installer`, show the blurred public lead, accept it, and reveal private homeowner details.
7. Close with the Reonic value: a richer qualified lead that an installer can review in minutes.

## Known Limitations

- Heat-pump sizing is intentionally simple and based on a default heated area assumption.
- Module placement is not obstruction-aware; roof geometry informs sizing, not a final install layout.
- Lead storage is in memory, so deploy restarts reset demo leads.
- Installer identity is hardcoded to a single Berlin installer for the demo loop.
- Tavily tariff parsing is best-effort and falls back to `€0.32/kWh` when no credible `0.20..0.50` value is found.
- Gemini image generation is not currently wired in the app; Gemini is used for rationale text.

## Credits

Built solo at Big Berlin Hack 2026, Donaustraße 44 Berlin.
