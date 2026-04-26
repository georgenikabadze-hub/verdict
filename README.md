# Verdict

> AI solar-quote intelligence for the **Reonic** track at **Big Berlin Hack 2026**.
> Type your address, see your real roof in 3D, get three commercially plausible BoM options grounded in 1,277 real Reonic projects + live German market prices, and hand the installer a fully qualified lead with sun-aware panel placement.

- **Live demo:** https://verdict-gamma-ten.vercel.app
- **GitHub:** https://github.com/georgenikabadze-hub/verdict
- **Track:** Reonic — AI Renewable Designer
- **Built solo** at Donaustraße 44, Berlin

---

## The Reonic Challenge

Reonic helps installers plan, size, and sell PV + battery + heat-pump systems. The first homeowner touchpoint, however, is still a generic web form: an address and a monthly bill. That gives the installer no roof facts, no demand profile, no AI placement, and no commercially plausible BoM — they spend hours per lead manually qualifying.

**The opportunity:** turn the homeowner intake into a Reonic-quality qualified lead *before* the installer touches it.

## What Verdict Does

1. **Homeowner side (60 seconds)** — enter address, annual consumption (€/yr or kWh/yr), three preference pills (battery / heat pump / EV), submit. Behind the scenes Verdict resolves the building via Google Maps, fetches roof segments and obstruction-aware per-panel placement from the **Google Solar API**, derives the demand profile, and stores the lead with a privacy-blurred public preview.

2. **Installer side** — Berlin Solar Pro picks up the lead. The map shows the **photoreal 3D building** via Cesium + Google's Photorealistic 3D Tiles, with Solar API panels placed on the dominant roof face. The installer can click panels off (obstructions Google missed), click empty spots to add panels, toggle entire roof segments on/off, and the BoM cost + payback recompute live with **yield-weighted scaling** — removing a 410 kWh/yr south panel hits savings far harder than removing a 226 kWh/yr shaded north panel.

3. **Market-aware BoM** — three variants (Best Margin / Best Close Rate / Best LTV) are composed from a **cached German solar market catalog**, scraped once via Tavily and structured by Gemini. Every BoM line shows a source-URL chip back to where Tavily found it (pv-magazine.com, jasolar.com, etc.).

4. **Sizer with demand cap** — NPV-optimal panel count, *capped* at 1.25× household demand (with heat-pump and EV inflation if selected), so the system never recommends a 24 kWp commercial-scale install for a 4-person household just because feed-in tariff is marginally NPV-positive.

5. **Send offer** → homeowner sees the three variants for the first time on their phone, with installer attribution and a clear monthly-savings number.

---

## Architecture

```text
┌──────────────────────────── HOMEOWNER ────────────────────────────┐
│  /                                                                 │
│  ├─ Google Places autocomplete (real building only)                │
│  ├─ Annual consumption (€/yr or kWh/yr)                            │
│  ├─ 3-state prefs: battery / heat pump / EV (yes / no / idk)       │
│  └─ Submit → POST /api/leads                                       │
└────────────────────────────────────┬───────────────────────────────┘
                                     │
              ┌──────────── PREFETCH ─┴────────────┐
              ▼                                    ▼
   Google Solar API                          Demand profile
   ├─ buildingInsights:findClosest           ├─ annualKwh
   │   • roofSegmentStats[] (pitch, az, h)   ├─ dailyKwh
   │   • solarPanels[] (per-panel placement) └─ self-consumption
   │   • boundingBox (clip target)
   └─ dataLayers (sun heatmap)  ◀── in flight
                                     │
                                     ▼
                         lib/leads/store.ts
                         (publicPreview vs privateDetails)
                                     │
              ┌──────────── INSTALLER ──┴──────────────┐
              ▼                                         ▼
   /installer marketplace                    /installer/[id] detail
   ├─ live refetch on mount + focus          ├─ Cesium Photoreal 3D
   ├─ blurred until accept                   ├─ Solar API panel overlay
   └─ exact-view debug toggle                │   • per-segment plane fit
                                             │   • V-only row snap
                                             │   • per-segment height
                                             │     sample with geoid
                                             │     sanity check
                                             │   • click toggle, click-add
                                             ├─ Per-segment yield table
                                             │   with on/off toggle
                                             ├─ AI-prefetched brief
                                             │   (roof area, segs, sun,
                                             │   demand, dominant az)
                                             └─ 3 BoM variants from
                                                cached Tavily catalog
                                                with source URL chips
```

---

## Partner Technologies

| Tech | Where it is used | File path |
|---|---|---|
| **Google Gemini** | (a) Runtime rationale generation per quote variant. (b) Build-time structured extraction of German solar market product listings from Tavily snippets. | `lib/api/gemini.ts`, `lib/sizing/rationale.ts`, `scripts/scrape-catalog.ts` |
| **Tavily** | (a) Runtime residential electricity tariff lookup with 4 s timeout and deterministic fallback. (b) Build-time German solar market scraping across 6 categories (panels, inverters, batteries, wallboxes, heat pumps, mounts). | `lib/api/tavily.ts`, `app/api/quote/route.ts`, `scripts/scrape-catalog.ts`, `data/fixtures/german_market_catalog.json` |
| **Google Maps Platform + CesiumJS** | Geocoding, Places autocomplete, Solar API roof segments + per-panel placement, Photoreal 3D Tiles for the live roof view, OSM Overpass for footprint clipping. | `app/api/quote/route.ts`, `app/api/roof-facts/route.ts`, `lib/api/solar.ts`, `lib/osm/footprint.ts`, `components/homeowner/CesiumRoofViewInner.tsx` |
| **Lovable** | Initial UI scaffold for the installer-side variant cards (`VariantCardLovable`). Generated via Lovable, then wired into the React tree by hand. Header comment marks Lovable provenance. | `components/installer/VariantCardLovable.tsx` |
| **Gradium** ([gradium.ai](https://gradium.ai)) | Voice-AI homeowner intake. The intake form has a "Tap to record a voice note" control; the browser captures 24 kHz mono int16 PCM via an `AudioWorkletNode`, POSTs the raw bytes to `/api/voice-transcribe`, and the route streams them through Gradium's WebSocket ASR (`wss://eu.api.gradium.ai/api/speech/asr`, model `default`, `input_format: "pcm"`). The returned transcript ships with the lead so the installer sees both the audio playback and the text — useful for any context the form can't capture (tree shading, future-EV plans, accessibility constraints). | `app/api/voice-transcribe/route.ts`, `components/homeowner/VoiceMemoRecorder.tsx`, `components/installer/InstallerLeadDetail.tsx` (voice memo card) |

---

## Key Engineering Wins

### 1. Sun-aware photoreal panel placement

- **Per-segment height sampling.** The installer-side overlay calls `viewer.scene.sampleHeightMostDetailed()` at each Solar API segment center after the photoreal tiles stream in, derives a global geoid offset (Solar API returns orthometric, Photoreal 3D Tiles use WGS84 ellipsoidal — ~+45 m delta in Berlin), and anchors every panel to the actual rendered roof surface with a sanity check that rejects samples that hit courtyard mesh.
- **V-only row snap.** Panel rows align by down-slope index but along-row spacing is preserved exactly as Google placed it, so chimneys, dormers, skylights, and mansards Google routed around stay routed-around.
- **Top-1 highest-yield segment.** Panels render as one dense rectangular layout on the dominant roof face rather than scattered across all segments — closer to how a real install looks.

### 2. Demand-aware sizer

- NPV-optimizer caps panel count at **1.25 × futureDemand**, where `futureDemand = annualKwh + heatPumpInflation + evInflation`. Heat pump: `yes`=+3,500 kWh, `idk`=+1,500. EV: `yes`=+2,500 kWh, `idk`=+1,200.
- Stops the optimizer from selling a 24 kWp commercial-scale system on a residential demand profile because German feed-in tariff (€0.082/kWh) is still marginally NPV-positive past full demand coverage.

### 3. Yield-weighted live recompute

- Each panel carries `yearlyEnergyDcKwh` from Solar API. When the installer toggles a panel or a whole segment, savings + payback scale by `activeYieldKwh / totalSlicedYieldKwh` — not by linear panel count. Removing a south panel hits the BoM ~80% harder than removing a north panel.

### 4. Privacy split

- `lib/leads/store.ts` separates each lead into `publicPreview` (district, blurred coordinates, roof facts, sizing, BoM variants) and `privateDetails` (exact address, name, email, phone). Deterministic FNV-1a blur in `lib/leads/blur.ts` produces 250–500 m random-but-consistent offsets — same lead always renders at the same blurred coords across reloads.

### 5. OSM building picker

- Tag-richness gate on contains-true polygons (Berlin Altbau Vorderhaus vs Hinterhaus). A geocoded address can land *inside* multiple stacked OSM polygons; tagless courtyard buildings now get a +40 score instead of +100, so a tagged sibling Vorderhaus wins on tie.
- OSM-vs-Solar sanity: discard the OSM polygon if Solar's bbox center is more than 8 m outside it. Falls back to the Solar bbox, which is by definition where Google placed the panels.

### 6. Gradium voice intake

The homeowner intake form ([components/homeowner/IntakePanel.tsx](components/homeowner/IntakePanel.tsx)) ships with an optional voice memo control. End-to-end flow:

1. Homeowner taps the mic. We open `getUserMedia({ sampleRate: 24000, channelCount: 1 })` and pipe the stream into an inline `AudioWorklet` that downconverts to int16 PCM and posts buffers back to the main thread.
2. On stop, the captured PCM is concatenated and POSTed as `application/octet-stream` to `/api/voice-transcribe`. We also wrap the same PCM in a self-contained WAV header so a plain `<audio>` element can play it back without any decoder library.
3. The route ([app/api/voice-transcribe/route.ts](app/api/voice-transcribe/route.ts)) opens a Node-native WebSocket to `wss://eu.api.gradium.ai/api/speech/asr` with header `kyutai-api-key`, sends a `setup` frame (`model_name: "default"`, `input_format: "pcm"`), waits for `ready`, streams the PCM in 80 ms slices as base64-encoded `audio` frames, then `eos` and collects the `text` events back.
4. The transcript + WAV data URL ride along on the lead POST → land in `LeadRecord.privateDetails.voiceNote` → render on the installer's lead detail as an inline audio player + transcript card.

If Gradium is unreachable (cold-start network blip), we still ship the audio with the lead — the installer just doesn't get a transcript that time. Demo never blocks on the voice path.

### 7. Tavily-powered market catalog

The installer BoM is grounded in a **cached** catalog of real German solar market data. The runtime never calls Tavily — it reads the cached fixture — so the demo is bulletproof against API outages.

```text
scripts/scrape-catalog.ts
  ├─ Tavily fan-out (6 parallel queries, 4 s timeout each)
  │    panels / inverters / batteries / wallboxes / heat pumps / mounts
  │
  ├─ Gemini 2.5 Flash structured extraction (one call per category)
  │    snippet → { brand, model, kw|kwh|wp, eurEx, sourceUrl, sourceTitle }
  │
  └─ data/fixtures/german_market_catalog.json
       { scrapedAt, source, panels[], inverters[], ... }
```

Re-scrape with current market data:

```bash
pnpm scrape:catalog        # requires TAVILY_API_KEY + GEMINI_API_KEY
```

The Tavily partner-tech requirement is satisfied **twice**: runtime tariff lookup + build-time market research driving the BoM composer.

---

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
GRADIUM_API_KEY=          # gsk_… key from gradium.ai — voice memo transcription
```

Run:

```bash
pnpm dev          # http://localhost:3000
```

---

## Test Plan

```bash
pnpm tsc --noEmit  # type-check
pnpm test          # vitest, 36 tests
pnpm lint          # eslint
```

Verified addresses (parity sizing checked across `/api/quote` and POST `/api/leads`):

- `Hubertusbader Straße 8, 14193 Berlin` — single-family pitched roof, ~13 panels
- `Tegeler Weg 5, 13629 Berlin` — single-family
- `Diedersdorfer 3, 13627 Berlin` — single-family
- `Nebinger Str. 4, 14195 Berlin` — Steglitz-Zehlendorf single-family with mature tree canopy (good test for sun-aware placement)
- `Arnimallee 2, 14195 Berlin` — FU Berlin research building (multi-segment Altbau, stress test for the picker + sizer cap)

Manual flow:

1. `pnpm dev`
2. Enter one of the addresses → `/quote` → submit
3. Open `/installer` → click the lead
4. Verify panels sit on the rendered roof, BoM total reflects demand-cap, segment toggle in the sidebar removes/restores panels live
5. Send offer → homeowner toast appears

---

## Demo Script (60 s)

> "**Verdict** — Big Berlin Hack 2026, Reonic track.
>
> *(homepage, address autocomplete)* Homeowner gives us four things: address, annual bill, heat pump, EV charger. Plus an optional voice memo via **Gradium**: 'I have a chestnut tree on the south side that shades the roof from 4pm in summer' — Gradium transcribes it server-side, so the installer hears the homeowner's actual voice and reads the text in the same place.
>
> *(submit, see /quote confirm)* Behind the scenes our AI fetches the roof layout, sun exposure, per-panel placement, and the per-pixel solar heatmap from the **Google Solar API**. The lead lands in the installer marketplace, privacy-blurred.
>
> *(open /installer)* Berlin Solar Pro picks it up. The photoreal 3D building loads via Cesium + Google's photoreal tiles. Solar API panels are placed obstruction-aware on the dominant roof face. The AI-prefetched technical brief — roof area, segments, sunshine hours, demand, dominant azimuth — is already there before the installer does anything.
>
> *(click a panel off)* Yield-weighted recompute: this 410 kWh south panel disappearing drops monthly savings by 4 €. *(click a north panel off)* This 226 kWh north panel only drops it by 2 €. The math reflects the actual sun.
>
> *(open BoM)* Three options — Best Margin, Best Close Rate, Best LTV — each with real prices from **Tavily**-scraped German market data. Source-URL chip on every line: this Tesla Powerwall came from pv-magazine.com, this JA Solar 580W came from jasolar.com.
>
> *(send offer)* Homeowner gets a push, opens the link, sees three priced variants for the first time.
>
> Four partner techs: **Tavily** for live market scraping, **Gemini** for rationale + catalog extraction, **Lovable** for UI scaffolding, **Gradium** for voice intake transcription. Plus the full Google stack — Maps, Places, Solar API, Photorealistic 3D Tiles, Gemini."

---

## Roadmap (in flight)

- **Solar API Data Layers** — paint the per-pixel sun heatmap directly on the photoreal roof so the installer literally sees where trees shade the building. Per-position panel yield sampled from the raster instead of segment-uniform Solar API estimates. ROI recompute uses the real per-spot yield. (Branch: `main`, in progress.)
- **Hourly shade scrubber** — Solar API's 24 hourly-shade rasters animated as a slider so you watch tree shadows sweep across the roof through an average day.
- **Persistence layer** — replace in-memory lead store with Firestore for cross-environment + cross-deploy continuity.

---

## Known Limitations

- Lead storage is in memory (`globalThis.__VERDICT_LEAD_STORE__`). Vercel cold starts and dev-server restarts wipe demo leads. Marketplace refetches on mount + focus to mitigate cross-lambda gaps; persistence layer is on the roadmap.
- Heat-pump sizing uses a default heated-area assumption.
- Tavily tariff parsing is best-effort; falls back to €0.32/kWh when no credible 0.20–0.50 value is found in scrape results.
- The Vercel runtime can't currently read `TAVILY_API_KEY` despite `vercel env pull` showing it set — Tavily lookups fall back to the default tariff in prod. Localhost has Tavily live. Cached Tavily-scraped market catalog is committed to the repo so the BoM still shows real market prices everywhere.
- Installer identity is hardcoded to a single Berlin installer for the demo loop.

---

## Credits

Built solo at Big Berlin Hack 2026 — Donaustraße 44, Berlin.

Reonic gave us 1,277 real residential PV + battery + heat-pump projects to learn from. Their dataset is the spine of the sizing baseline (`lib/reonic/recommend.ts`). Track prize: €2,501 + Reonic care package + dinner with founders.
