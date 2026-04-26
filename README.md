# Verdict — Solar Lead Marketplace
_Big Berlin Hack 2026 · Reonic track_

## What it is

Verdict is a dual-sided platform connecting Berlin homeowners to verified solar installers. A homeowner enters an address and a few demand preferences, then gets an instant AI-generated technical brief from their real roof. The installer receives a qualified, gated lead with roof intelligence, sun yield, panel placement, and an editable BoM instead of a generic contact form.

## Demo

- Homeowner side: `/` — quote intake, address autocomplete, roof preview, lead submission
- Installer side: `/installer` — lead marketplace, roof intelligence, Cesium panel editing, offer send-back

## Tech stack

- **Next.js 15.5.15 App Router** — React 19 app routes, server components, and API routes.
- **TypeScript strict** — shared quote, BoM, sizing, and lead contracts.
- **Tailwind CSS 4** — app styling through CSS tokens and utility classes.
- **Google Maps JavaScript API** via `@googlemaps/js-api-loader` — Places autocomplete and homeowner roof map fallback.
- **Google Geocoding API** — `/api/forward-geocode` and `/api/reverse-geocode` resolve typed addresses and browser coordinates.
- **Google Solar API `buildingInsights:findClosest`** — roof segments, pitch, azimuth, area, sunshine hours, bounding boxes, and Google-proposed `solarPanels[]`.
- **Google Solar API `dataLayers:get`** — annual flux GeoTIFF source for the sun heatmap raster overlay.
- **CesiumJS 1.140.0** — installer-side photoreal 3D roof view using Google Photorealistic 3D Tiles and custom panel/heatmap entities.
- **GeoTIFF + Sharp** — converts Solar API annual flux rasters into PNG heatmaps for Cesium.
- **Gemini 2.5 Flash through Google Generative Language REST** — JSON-only quote rationale generation and one-off market catalog extraction in `scripts/scrape-catalog.ts`.
- **Tavily** — market research input for the cached German solar equipment catalog and runtime tariff lookup fallback.
- **Gradium ASR WebSocket** — optional homeowner voice memo transcription through `/api/voice-transcribe`.
- **Zod** — schema validation for Gemini outputs and data contracts.
- **coordinate-parser** — accepts decimal and DMS coordinate input.
- **lucide-react** — UI icons.
- **react-three-fiber / drei / three** — Ruhr cinematic GLB scene on the homeowner side.
- **Next.js API routes + process-local Map** — demo backend for quote, roof facts, heatmaps, voice transcription, and in-memory leads.

## How the AI brief is built

- Address or coordinates are resolved to `lat/lng` through Google Places or Geocoding.
- The server calls Google Solar `buildingInsights:findClosest` for measured roof segments, sun hours, pitch, azimuth, and candidate panel positions.
- Deterministic sizing converts roof facts plus homeowner demand into panel count, kWp, battery/EV/heat-pump assumptions, savings, payback, and three BoM strategies.
- Solar `dataLayers:get` provides the annual flux GeoTIFF; Verdict colorizes it into a PNG and overlays it in Cesium as a sun heatmap.
- The installer view combines segment-first AI panel layout, editable panel toggles/additions, yield-weighted recompute, Gemini rationale, and a technical brief for approving the lead.

## Run locally

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

Required environment variables are listed in `.env.example`.

## Authors

- Ahmed Sohail — ahmed.sohail@code.berlin
- Robin Kryszak — r.kryszak@icloud.com
- George Nikabadze — george.nikabadze@code.berlin
