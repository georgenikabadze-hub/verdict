# Verdict — Plan
*Big Berlin Hack 2026 · Reonic track · Submit Sun 14:00*

> Reonic's installer-DNA quote intelligence layer.
> Synthesized from 3 rounds of Gemini + Codex critical brainstorm.

---

## 1. Concept

**Verdict turns Reonic's automated technical plan into the quote an experienced installer would actually sell.** It is *Automatisierung + Erfahrungswissen* — not "AI", in the German sense that Reonic itself never markets AI. Built on Reonic's proprietary 1,277 real projects + 19,257 line items, it predicts which hardware combination will actually get signed. Reonic already automates the layout. Verdict automates the commercial judgment that experienced installers still do by hand.

## 2. The 5-Minute Pitch (verbatim)

> **(0:00 — Hook)** "Reonic already automates the technical plan — the layout, the strings, the inverter sizing, the BoM. What's still done by hand is the *commercial judgment*: which BoM will the customer actually sign, at what margin? Verdict automates that — using your own 1,277 completed projects."

> **(0:30 — The familiar surface)** *Open Verdict — it looks like Reonic's planner. Same 3D mesh, same German side panel: Modul-SKU, Anzahl Module, Watt Peak, Aufständerung, Abstand horizontal/vertikal.*
>
> "We rebuilt Reonic's placement workflow in 24 hours so the AI sits inside the workflow you already ship."

> **(1:00 — The auto-fill)** *Click "Auto-fill with Verdict." The fields populate themselves: Module SKU LR7-54HVH-475M, Anzahl 24, Watt Peak 11.4 kW, Vertikal, Aufständerung 0, Abstand 2 cm. Three variant cards appear in a strip across the top: **Best Margin · Best Close Rate · Best Lifetime Value**.*
>
> "Every variant is anchored in Reonic's data — 1,277 real projects, 19,257 line items, this installer's actual brand bias. Reonic gave us the layout. Verdict picks the BoM the homeowner will actually sign."

> **(1:30 — The "Why this wins" reveal)** *Click a card.*
>
> "Verdict says: *'Best Close Rate — projects #882, #1041, #1198 used a similar Huawei-led BoM in the 8-12 kWp band, all closed at 28-31% margin. Risk: homeowner may reject 12 kWh battery on price; counter with FoxESS bundle from project #842 where similar household closed at -€800 upfront.'*"
>
> "Try that on OpenSolar Ada — they have 28k generic installers' patterns. We have *yours*. Different product."

> **(2:30 — The 3D moat + shading)** *Rotate to a German drone mesh from Reonic's dataset. Sun arc animates across the roof — shading heatmap shifts in real time.*
>
> "Reonic has cm-precision drone meshes that satellite tools can't match. Verdict measures every face — 42.1 square metres, 32° pitch, 187° azimuth — runs the annual sun path against neighbouring buildings, and rejects panel positions that lose more than 12% to shading. **Aurora gets you irradiance per panel; Verdict gets you the same plus the installer-DNA reasoning underneath.**"

> **(3:00 — The Lead Intake flip)** *Switch view to a phone screen. Homeowner mode opens.*
>
> "Same engine, second surface — and a second revenue line. This is Lead Intake. The homeowner types their address. Their actual roof appears. They confirm with one tap. Four fields — bill, EV, heating, goal. Every change mutates the 3D scene live. Above the quote cards: *'Based on 41 Reonic projects within 5 km of your house.'*"
>
> *Tap "An zertifizierten Installateur senden."*
>
> **(4:00 — The Verdict-Qualified Lead lands)** *Switch back to the installer view. A new lead card stamps in: "Müller Solartechnik · Verdict-qualified lead from Conrad Smith · 22.100 € · Best Close Rate."*
>
> "Installers pay 50 to 200 euros for a generic solar lead today — just an address and a bill amount. A Verdict lead carries measured roof, demand, intent, and a Reonic-grounded BoM. **Worth 5× a generic lead, because the installer can quote in minutes instead of days.** That's Reonic's second revenue line: intake-as-a-service on top of installer SaaS."

> **(4:30 — Close)** "Verdict isn't the AI for *every* solar quote. It's the AI for *Reonic's* quote — only Reonic's data can train it, only Reonic's installers benefit. **Ship Verdict, and OpenSolar Ada becomes the generic alternative to the Reonic-native intelligence.**"

> **(4:55)** *"Repo and Loom in submission. Thank you."*

## 3. The Wow Moment

Three quote cards side-by-side. Each has: brand mix, projected installer margin %, substitution confidence, win-rate band, **annual yield (kWh/kWp), measured roof area (m²), shading-adjusted output**. Click any card → expandable "Why this wins" panel cites concrete patterns from real Reonic project IDs **and shows a per-face shading heatmap with sun-path animation on the actual 3D mesh**. **No timer. No countdown. The wow is depth, not speed.**

---

## 4. Partner Technologies (must use 3 of 7)

The hackathon mandates **at least 3** of the official partner technologies. Below is what each partner *could* power in our system. Final picks decided at the hackathon based on what works on the day.

| Partner | What it's good for in Verdict | Likelihood we use it |
|---|---|---|
| **Google Gemini** *(Deepmind)* | The quote-intelligence engine: structured-output JSON, "why this wins" rationale generation, chat refinement, optional bill OCR | **Almost certain** — multimodal + reasoning fits the core need |
| **Lovable** | v0 scaffold of the comparison-card UI and installer-DNA panel; bail to manual Next.js if it slows us down | **Likely** — fastest path to a polished UI |
| **Tavily** | One web call for the current local electricity tariff (so ROI numbers are honest, not hardcoded) | **Likely** — single API call, low risk |
| **Gradium** *(voice)* | Optional polish: hands-free quote refinement ("swap the Huawei inverter for EcoFlow") | **Maybe** — only if core flow is locked early |
| **Pioneer / Fastino** | Fine-tune a small model on the 1,257 paired projects to outperform Gemini on installer-design parity | **Maybe** — only if dataset prep + training fits in <8h |
| **Entire** | Agent CLI orchestration if we end up building a multi-agent pipeline | **Unlikely** — we're not building an agent swarm |
| **Aikido** | Repo security scan (side prize €1k, not eligible as one of the 3) | **Yes** — 30 min, free money |

**Plus (not partner techs but needed to make the demo work):**
- **Google Maps Platform — Solar API**:
  - `buildingInsights` → roof segments + area + max panel count + pitch/azimuth (instant numbers)
  - `dataLayers` → annual flux GeoTIFF (kWh/kW/yr per 10cm pixel), monthly flux (12 layers), DSM, mask, hourly shade — **this is our shading source**
- **Google Maps Platform — Photorealistic 3D Tiles** for the satellite-path demo (no drone)
- **Vercel** — public hosting URL for the jury

---

## 4a. Two User Modes — Installer (hero) and Homeowner (Lead Intake)

Verdict ships in two modes that share the same engine. **The installer is the hero. The homeowner side is a Lead Intake pipeline — every completed homeowner session produces one Verdict-Qualified Lead that lands in an installer's inbox.**

### The commercial framing (use this in the founder pitch)
Installers in DE pay €50–200 for a generic solar lead today (just an address + maybe a bill amount). A **Verdict-Qualified Lead** carries: measured roof geometry, real demand profile, EV + heating intent, customer goal, *and* a Reonic-grounded recommended BoM with cited similar projects. **A Verdict lead is worth 5× a generic lead because the installer can quote in minutes instead of days.** This is the second revenue line for Reonic: *intake-as-a-service* on top of the existing installer SaaS.

### Installer mode (the moat — pitched to the founders)
Installer logs in, opens an existing project, sees: 3 quote variants with margin %, substitution confidence, "why this wins", roof faces with measurements + shading, draft BoM ready to push into Reonic CRM.

### Homeowner mode = Lead Intake → Verdict-Qualified Lead
**Pattern B: Roof-first, form on the side.** The roof is the canvas. The form is the controls. As the homeowner fills fields, the visualization mutates in real time. Conceptually two phases:

#### Phase A — Lead Intake (what the homeowner is doing)
1. Lands on the page → sees an example roof rotating with panels.
2. Address input — Google Places **autocomplete** primary; pin-nudge fallback ("Wrong roof? Move pin").
3. Building footprint highlights on a satellite basemap with the 3D mesh on top → micro-confirm **"Is this your roof? · Yes / Adjust pin"**.
4. Side panel reveals **MAX 4 fields**:
   - Monthly electricity bill (slider, € or kWh)
   - EV: yes/no toggle
   - Heating: gas / oil / district / electric heat pump (icon row)
   - Primary goal: *Lower my bill* / *Independence* (toggles whether the engine optimizes for ROI or autarky)
5. Each field mutates the 3D scene + 3 quote cards in real time. EV toggle materializes a wallbox; bill slider adds/removes panels; goal toggle swaps the recommended battery size.
6. **Installer Confidence Score badge** above the cards: *"Based on 41 Reonic projects completed within 5 km of your house."* This is the bridge back to the moat.

#### Phase B — Lead Qualification & Handoff
7. CTA: **"Send to a certified local installer"** → generates a Verdict-Qualified Lead packet containing:
   - Address + lat/lon + measured roof faces (area, pitch, azimuth)
   - Demand profile from bill
   - Intent (EV, heating, goal)
   - Recommended BoM variant the homeowner picked + the other 2 for context
   - Cited similar Reonic projects
   - Verdict Link (unique URL the installer can open to see the same view)
8. For the demo: clicking sends flips to the installer view with a card *"Müller Solartechnik received Verdict-qualified lead from Conrad Smith — 22.100 € — Best Close Rate variant"*.

### Hard rules for Lead Intake
- Never collect more than 4 fields in Phase A. Infer or defer everything else.
- Never offer a deposit, payment, or "buy now" CTA — legally and operationally risky in DE.
- Never imply the homeowner can bypass the installer. Every CTA routes through one.
- Mobile-first — homeowners are on phones at the kitchen table.
- Every lead must include the structured packet above. No raw "address + bill" leads — that's what other platforms do.

## 4b. Two Sources of Truth — Mesh vs. Solar API

Roof measurements and shading both come from two independent sources. We use both, side by side.

| Signal | Mesh-derived (Reonic drone) | Solar-API-derived (Google satellite) |
|---|---|---|
| Face area (m²) | Triangle-normal clustering of `.glb` → polygon hull → projected area | `buildingInsights.roofSegmentStats[i].stats.areaMeters2` |
| Pitch / azimuth | Normal vector → spherical coords | `buildingInsights.roofSegmentStats[i].pitchDegrees / azimuthDegrees` |
| Annual flux (kWh/m²/yr) | Not directly — needs PVlib offline sim | `dataLayers.annualFluxUrl` GeoTIFF |
| Monthly flux | Not directly | `dataLayers.monthlyFluxUrl` GeoTIFF (12 bands) |
| Shading mask | Mesh-domain raycast (expensive) | `dataLayers.maskUrl` + `dsmUrl` (free) |
| Strength | cm-precision; cannot be matched by satellite | Free, instant, includes neighbor-building shading |

**Why both**: the founders love source-agreement (or honest disagreement). Showing "Mesh: 42.1 m² ; Solar API: 41.8 m²" makes the AI feel calibrated, not fabricated.

## 4d-prefix. Sizing formulas + validation rules (deterministic core)

The deterministic placer/sizer uses these formulas. **The LLM only validates and explains — never overrides math.**

### Sizing formulas
- **Panel count** = Annual kWh ÷ (PSH × 365 × panel_Wp × 0.001 × system_efficiency)
- **Battery kWh** = Daily kWh × self_consumption_target × (1 − solar_daytime_fraction)
- **Heat pump kW** = (Building_area × heat_loss_W_per_m²) ÷ 1000 × safety_factor

### Constants (German residential defaults)
- `self_consumption_target = 0.80`
- `system_efficiency = 0.85`
- `DoD safety_factor = 1.2`
- `heat_pump safety_factor = 1.1`

### Hard validation rules (run AFTER sizing, BEFORE showing the variant)
- **Inverter ratio**: panel_kWp × 0.75 ≤ inverter_kW ≤ panel_kWp × 1.10
- **Battery sanity**: 0.5 ≤ battery_kWh / daily_kWh ≤ 2.0
- **Roof area fit**: total_panel_area_m² ≤ usable_roof_area_m²
- **German 70% feed-in rule**: if no battery & no controlled curtailment, inverter output capped at 0.70 × panel_kWp (regulatory hard limit; reduce panel count or add storage if violated)
- **Auto-adjust logic on failure**: reduce panel count first, then adjust battery, then flag for installer

### Edge cases that need explicit handling
- North-facing roof → reduce expected yield by ~30% before sizing
- Very low consumption (< 2,000 kWh/yr) → no battery, smaller panel set, no HP
- Apartment / shared roof → flag as out-of-scope ("Eigentümergemeinschaft erforderlich")
- Existing PV system → only size additional capacity

### Free data sources for the inputs
| Need | API | Cost | Note |
|---|---|---|---|
| Annual yield per kWp + monthly distribution | **PVGIS** (EU Commission) | Free, no key | `re.jrc.ec.europa.eu/api/v5_2/PVcalc` |
| Heating Degree Days (HDD) for HP sizing | **Open-Meteo** | Free, no key | `archive-api.open-meteo.com` |
| HDD/CDD raster maps by region | **Copernicus CDS** | Free, requires register | optional |
| Roof segments + pitch + azimuth + area | **Google Solar API** `buildingInsights` | paid (cache!) | our primary roof source |
| Photogrammetry mesh | **Reonic .glb** (we already have) | free | demo addresses only |
| Live electricity tariff lookup | **Tavily** | partner tech | one call per session |

## 4d. Coordinates → 3D House Pipeline (homeowner mode)

**The "demo path" uses the 4 Reonic drone meshes we already have.** They are cm-precision photogrammetry of real German buildings — better than anything we could fetch live. For "any other address" we would use Google Photorealistic 3D Tiles + Solar API, but the live demo is locked to the .glb addresses.

| Step | Demo address (one of our 4) | Live "any address" path |
|---|---|---|
| 1 — Coordinates | Pre-resolved lat/lon for the .glb (e.g. Hamburg `53.315578, 9.860276`) | Google Places Autocomplete → lat/lon. "Use my location" is a secondary button — geolocation is a permission-prompt risk in the live demo. |
| 2 — House render | Load the cached `Hamburg.glb` (DRACOLoader), normalize CESIUM_RTC origin, fly camera in cinematically (low-altitude → 45° oblique). Drop a pulsing pin with the address label. | CesiumJS + Photorealistic 3D Tiles. Camera fly-in 3 sec staged "Finding property → Loading 3D view → Detecting roof faces" loading sequence to hide tile latency. |
| 3 — Roof faces | Cached `roof_faces.json` from Saturday-night precompute. | Live call to Google Solar API `buildingInsights` → `roofSegmentStats` polygons + pitch + azimuth + area. Overlay polygons on the 3D scene. |
| 4 — Trust micro-confirm | "Ist das Ihr Haus, Musterstraße 12? · ✓ Ja / ↻ Pin anpassen" | Same UI; pin-nudge fallback if Solar API picked the wrong building. |

**Fallback ladder if any path breaks live:** (a) 3D Tiles → static satellite image with Solar API polygons overlaid, (b) Solar API down → user draws roof rectangle manually, (c) Geolocation denied → Places autocomplete only.

## 4e. Homeowner site — Lead Intake wireframe

This is what the customer sees, in order. German labels match Reonic's tone. **Screens 1–3 are Phase A (Lead Intake). Screens 4–7 are Phase B (Lead Qualification + Handoff).**

### PHASE A — LEAD INTAKE

**Screen 1 — Landing (full bleed)**
```
              Was kostet eine Solaranlage für Ihr Haus?

              ┌──────────────────────────────────────┐
              │ 📍 Ihre Adresse eingeben...          │
              └──────────────────────────────────────┘

                     oder  ⌖ Mein Standort verwenden

              "Verdict — 41 Reonic-Projekte
               in 5 km Umkreis bereits umgesetzt"
```

**Screen 2 — Cinematic fly-in (3 seconds)**
```
   [3D camera swoops from atmosphere down to oblique 45° view]

   "Grundstück gefunden · Lade 3D-Ansicht · Erkenne Dachflächen"
```

**Screen 3 — House confirm + 4-field side panel**
```
┌────────────────────────────────┬────────────────────────────────┐
│                                │ Musterstraße 12, Hamburg       │
│                                │ Ist das Ihr Haus?              │
│   [3D mesh of house            │ [ ✓ Ja ]  [ ↻ Pin anpassen ]   │
│    slowly rotating,            │                                │
│    pulsing pin on roof]        │ Stromrechnung / Monat          │
│                                │ ●━━━━━━━━━━━ 120 €             │
│                                │                                │
│                                │ ⚡ Elektroauto                 │
│                                │   ◯ Nein   ◉ Ja                │
│                                │                                │
│                                │ 🔥 Heizung                     │
│                                │   ◉ Gas  ◯ Öl  ◯ WP  ◯ Fernw. │
│                                │                                │
│                                │ 🎯 Ziel                        │
│                                │   ◉ Stromkosten senken         │
│                                │   ◯ Unabhängig werden          │
└────────────────────────────────┴────────────────────────────────┘
```

### PHASE B — LEAD QUALIFICATION + HANDOFF

**Screen 4 — Three variants stamp in (panels animate onto the roof)**
```
┌────────────────────────────────────────────────────────────────┐
│         [3D house with panels animating into place]            │
├────────────────────┬─────────────────────┬─────────────────────┤
│  Best Margin       │  Best Close Rate ★  │  Best Lifetime Value│
│                    │       Empfohlen     │                     │
│   9.5 kWp          │   11.4 kWp          │   13.8 kWp          │
│   6 kWh Akku       │   9 kWh Akku        │   12 kWh + WP       │
│   Huawei + EcoFlow │   Huawei + EcoFlow  │   Huawei + Vaillant │
│                    │                     │                     │
│   €18.400          │   €22.100           │   €31.800           │
│   Amort. 10.2 J.   │   Amort. 8.8 J.     │   Amort. 11.4 J.    │
│                    │   KfW-fähig         │   KfW-fähig         │
│                    │                     │                     │
│   [ Auswählen ]    │   [ Auswählen ]     │   [ Auswählen ]     │
└────────────────────┴─────────────────────┴─────────────────────┘
```

**Screen 5 — "Why this wins" expandable (after click)**
```
"Best Close Rate — diese Variante schlägt Verdict vor weil:
 ▸ Projekte #882, #1041, #1198 (8–12 kWp Bereich) wurden mit
   identischer Huawei + EcoFlow-Konfiguration alle vom Kunden
   unterschrieben (Marge 28–31 %)
 ▸ Risiko: 9 kWh Akku-Preis kann zur Ablehnung führen
   → Alternative: FoxESS-Bundle (Projekt #842, –€800 Anzahlung)
 ▸ KfW 270 förderfähig"
```

**Screen 6 — CTA**
```
              [ An zertifizierten Installateur senden ]
                                    ↓
        Verdict-Link wird erstellt · Müller Solartechnik
        erhält Ihren Vorschlag innerhalb von 24 Stunden
```

**Screen 7 — Loop back to installer view (the magic)**
*The demo flips to the installer side. A new lead card appears in their inbox: "Conrad Smith · 22.100 € · Verdict-vorqualifiziert · Best Close Rate · 9 kWh Akku". The same Reonic-style card from the marketing site, but generated by AI in 30 seconds.*

## 4c. Build Order — Homeowner MVP first, Installer view stretch

**Pivoted: the MVP is the homeowner side.** Installer view becomes a stretch goal — possibly just a static lead-inbox mock card showing the Verdict-Qualified Lead landing.

### Stage 1 — Homeowner MVP (must ship — the entire MVP)
The homeowner-facing site, end to end. Address → cinematic house reveal → 4-field intake → recommended variant + 2 alternatives → "Send to installer" CTA → handoff confirmation.

Concrete sub-deliverables:
1. **Hero landing** — full-bleed cinematic 3D German roof with sunlight sweeping panels onto it; one large address autocomplete input; subcopy citing Reonic data ("Basierend auf 1.277 echten Reonic-Projekten").
   - **Hero copy (locked)**: *„Ihr Haus kann mehr verdienen, als Sie gerade für Energie verlieren."*
   - **Opening 3 seconds (locked)**: black screen → thin neon scan line sweeps across a dark 3D neighborhood → one house locks into focus from above → roof edges glow → panels snap onto the roof with quiet precision → monthly savings number fades in *before* anything else.
2. **Cinematic house reveal** (2.8 sec) — staged "Grundstück gefunden · Lade 3D-Ansicht · Erkenne Dachflächen" loader; cross-fade from satellite top-down → cached `.glb` mesh oblique view; pulsing pin + address label; "Wir haben Ihr Dach gefunden."
3. **House interaction = guided, not free** — drag-rotate slightly, pinch-zoom, three preset views ("Dach / Straße / Module"). NO free CAD camera.
4. **4-field intake (stepper, locked)** — Postleitzahl (5-digit numeric) · Stromkosten / Monat (€ slider, default 120) · Heizsystem (segmented: Gas · Öl · Wärmepumpe · Sonstige) · Besonderheiten (multi-select chips: E-Auto · Pool · Homeoffice). Each field updates 3D scene live.
5. **The Verdict reveal — recommended-card layout (locked, top-to-bottom)**:
   1. Variant label badge: **Best Close Rate ★** (small, uppercase, neon accent)
   2. Big savings number: **„Sie sparen ca. €142/Monat"** (32px+, dominant)
   3. Horizontal payback timeline (Year 0 invest → Year 8 break-even → €38,400 über 25 Jahre)
   4. Component summary row with traffic-light dots: **🟢 PV · 🟢 Speicher · 🟡 Wärmepumpe**
   5. Three one-line trust bullets: *„passt aufs Dach" · „am schnellsten amortisiert" · „installer-ready"*
   6. **„Warum diese Empfehlung?" reveal drawer** — opens to show 3 cited Reonic project IDs + the brand-prior reasoning + the objection-prediction
   7. Primary CTA button (full-width)
   
   Two alternative variants collapsed below as compact cards: **Best Margin** and **Best Lifetime Value**.
6. **Surprise & delight (locked)** — animated panel snap with per-face count labels; bill transformation (€220 → €78); CO2 → trees ("34 Bäume im Schwarzwald"); **viral spouse-share card**: *„Schatz, unser Dach verliert gerade ca. €142 im Monat."* with the rendered house, payback timeline, and "Installer-ready in 60 Sekunden" footer.
7. **Trust block** — citations: 2-3 similar Reonic projects ("Ähnlich wie Projekte #882, #1041 in Hamburg"); explicit "No credit check, no income, no obligation" line; brand transparency (Huawei + EcoFlow logos visible).
8. **Handoff CTA (locked)** — primary button **„An geprüften Reonic-Installer senden"** + microcopy *„unverbindlich · kein Anruf · Installer erhält Ihre Verdict-Mappe (Dachvermessung, Bedarf, empfohlene Anlage) und kann sofort kalkulieren."*
9. **Confirmation screen** — animated "Verdict gesendet · Müller Solartechnik meldet sich innerhalb von 24 Stunden" + optional "Verdict-Mappe als PDF herunterladen".

**Tech stack**: Next.js + react-three-fiber + drei (`useGLTF` + DRACOLoader); shadcn/ui + react-hook-form for the stepper; Gemini 2.5 Pro for variant generation + rationale; KNN retrieval over `projects_status_quo.csv` + `project_options_parts.csv`; Google Places autocomplete; Google Solar API `buildingInsights` cached for the 4 demo addresses.

**Stage 1 killer trap**: `.glb` files are Draco-compressed + geo-anchored via `CESIUM_RTC`. **First task** Saturday: load each .glb, normalize origin to mesh center, smoke-test camera framing on all 4 — before any UI work.

**Mobile-first**: single column, thumb-first, 3D pinned to top 40% of viewport, sticky bottom CTA. Demo on phone-portrait.

**7-hour Stage 1 cut list** (in order of expendability): spouse-share card → CO2 trees → bill transformation → preset views. Floor: mesh loads, address triggers reveal, 4 fields update one variant card, send button shows confirmation.

### Stage 2 — Installer view (stretch)
A single screen showing the lead lands in the installer's inbox: customer card mimicking Conrad Smith / 4,450€ / Freddy format, with the recommended variant + measured roof + cited projects + traffic-light confidence per component. Links back to the homeowner-side Verdict view via the unique URL.

**Editable**: installer can change panel count / battery model / HP model and hit a **"Neu berechnen" (Recalculate)** button — re-runs the sizing engine, re-validates, re-shows variants. Confidence dots update live.

Time budget: 3-4h max. If Stage 1 polish needs more time, drop Stage 2 to a static screenshot in the slide deck.

### Stage 3 — AI brain depth (cut if late)
"Why this wins" expandable on each variant card, citing 3+ real project IDs and one objection-prediction. Validator delta badge ("vs. typischer Reonic-Quote: +€620 Marge, 2.1 Jahre schnelleres Payback").

### Stage 4 — Pure polish (cut if late)
- Sun-toggle for live shading on the mesh (procedural, not GeoTIFF)
- "Verdict-Mappe als PDF herunterladen" — 4-page beautifully formatted lead packet PDF (huge for shareability)

### Demo fallback ladder
| If only Stage 1 ships | The full homeowner-MVP demo: address → reveal → intake → recommended variant → handoff. Pitch lands. |
| Stage 1 + Stage 2 | Above + the installer-inbox card showing the lead arriving. Reonic founders see the loop. |
| Stage 1 + Stage 2 + Stage 3 | Adds AI depth ("why this wins" with citations). |
| All four | Adds shading + PDF download for shareability. |

### Golden demo dataset (precompute Saturday night)
Live AI **enhances** the demo, never **gates** it. Tonight, precompute and freeze:
- 1 selected mesh (recommend Hamburg.glb — smallest, 5 MB)
- 3 roof faces with normalized planes + collider fallback
- 3 variant cards with full BoM, ROI numbers, rationale text — cached as static JSON
- 5 nearest historical project IDs for the cited-similar block
- Google Places + Solar API responses for the chosen address — cached locally

If every API and LLM call dies on stage, the demo still runs from the golden dataset. **This is non-negotiable.**

### Golden test profiles (use as fixtures + end-to-end smoke tests)
These are the canonical homeowners we test the engine against. Each must produce the listed expected output ±10% on panel count.

| Profile | Location | Annual kWh | Roof | Heating | Expected output |
|---|---|---|---|---|---|
| **Family of 4** | Berlin Mitte | 5,200 | South 35°, 60 m² | Gas | 14 panels (5.6 kWp) + 10 kWh battery + 8 kW HP |
| **Couple, EV owner** | Munich Schwabing | 8,500 | South-West 30°, 80 m² | Oil | 22 panels (8.8 kWp) + 15 kWh battery + 10 kW HP |
| **Single person** | Hamburg Altona | 2,100 | E-W split, 40 m² | District heating | 8 panels (3.2 kWp) + 5 kWh battery, **no HP** |
| **Family** | Frankfurt Sachsenhausen | 12,000 | South 40°, 100 m² | Gas | 28 panels (11.2 kWp) + battery + 12 kW HP |
| **Large family + pool** | (anywhere) | high | South 40°, 100 m² | (gas) | + 12 kW HP, large battery |

If any profile produces a wildly off result, the formulas/constants are wrong. **All 5 must pass before Stage 2 starts.**

## 5. Workstream Split (no people, just buckets)

| Workstream | Owns | Likely partner-tech fit |
|---|---|---|
| **Data Moat** | Loading both CSVs, parsing component_name specs, building installer brand-bias profile, KNN/cohort lookups, margin assumptions, "why this wins" rationale generator | (no partner — pure data work) |
| **Quote Intelligence Engine** | Variant generation (3 cards), margin scoring, substitution confidence, structured-output prompt, chat refinement loop | **Gemini** (+ optional **Pioneer** fine-tune) |
| **Stage 1 — Baseline UI** | 3D viewer, click-to-place panels on roof face, module-group side form (German labels matching Reonic), groups list, project header | **Lovable** for v0; manual override for the panel-placement gesture |
| **Stage 2 — AI overlay UI** | "Auto-fill with Verdict" button, 3-variant comparison strip, "Why this wins" expandable, validator delta badge, JSON export | (extends Stage 1, no new framework) |
| **Stage 3 — Wow polish** | Shading sun-path animation, homeowner mode (roof-first, 4 fields, mobile-first), Verdict Link generator, Conrad-Smith-style lead card | **Lovable** + Google Places autocomplete |
| **Roof Geometry & Shading** | Loading the German `.glb` mesh; triangle-normal clustering → faces with **area (m²), dimensions, pitch°, azimuth°, tilt°**; bin-pack panels per face; fitment validator. **Shading: pull Google Solar API `dataLayers` (annual + monthly flux GeoTIFFs + DSM) → per-face annual yield % vs unshaded baseline → animated sun-path heatmap on the 3D mesh.** Outputs measurements + per-face annual flux as hard constraints to the LLM. | three.js + DRACOLoader; Google Solar API `dataLayers` (covered below) |
| **Pitch & Stage Choreography** | 5-min script, 2-min Loom, slide deck, competitor-contrast framing, backup script for tech failures, repo polish | **Aikido** scan + screenshot for the side prize |

## 5b. Visual aesthetic + anti-patterns

**Vibe**: Tesla precision meets German banking trust. Dark hero (Tesla feel). Light, calm, high-contrast interior (banking trust). Inter or SF typography. Single neon accent color for energy/yield. Zero marketing fluff. Premium 3D as the dominant visual, not stock photos.

**Anti-patterns — never do these**:
- ❌ kWp / inverter brands / BoM jargon in homeowner copy. Use *Anlagengröße*, not *kWp*.
- ❌ Phone number / income / age fields anywhere in intake.
- ❌ Generic stock solar imagery after the homeowner has typed an address (use their actual roof or nothing).
- ❌ Three equal choices with no recommendation — Germans want guidance, then comparison.
- ❌ Spinners and loading splashes — use staged labels ("Erkenne Dachflächen") or skeleton screens.
- ❌ Vague pricing — show a range with monthly equivalent.
- ❌ Popups, modals, sales-call CTAs.
- ❌ Free-fly camera for non-technical users — guided controls only.
- ❌ Asking the homeowner what *kind* of solar tech they want — that's our job.

## 6. Hard Rules
- **Stage 1 (homeowner MVP) ships before any Stage 2 work begins.** No exceptions. The installer view is stretch.
- **The first personalized reveal is the obsession.** When the cached `.glb` of the demo address fades in and the homeowner says "that's my house" — everything else is secondary. Mesh fidelity = mathematical trust.
- **The LLM never outputs geometry.** Coordinates, panel counts, placement positions all come from a deterministic placer. The LLM's only job is choosing the BoM (which SKU, which brand, which battery size) and writing the rationale.
- **Don't sell "AI" first.** Reonic doesn't market AI; Verdict shouldn't either. Pitch as *Automatisierung + Erfahrungswissen*. AI is the mechanism, not the headline.
- **Variant naming**: *Best Margin · Best Close Rate · Best Lifetime Value*. Not "Budget/Balanced/Premium". Outcome-named, not template-named.
- **Honor what Reonic owns**: never duplicate `automatische Dachbelegung`, `automatische Verstringung`, `Wechselrichterauslegung`, or `KfW-Förderservice`. Demo says: "We start *after* Reonic's automation. Verdict picks the commercial package."
- **KfW eligibility as a flag, not a calculator.** Show "Variant 2: KfW-relevant — likely eligible for Reonic's funding workflow." Never quote a specific rate live (legally risky if wrong).
- **Each variant rationale also flags one objection-prediction**: "Risk: homeowner may reject battery price; counter with project #X."
- **All 5 golden test profiles must pass ±10% on panel count before Stage 2 work begins.** If formulas drift, fix them before adding features.
- **German 70% feed-in rule is a hard cap**, not a suggestion. If a variant violates it, the variant is rejected — never shown to the user.
- **Every "Why this wins" rationale cites at least 3 real project IDs from the dataset.** No vague "this works well" filler.
- **Cache every API response** to SQLite or JSON fixtures the moment it works. Live calls only as a stretch flex.
- **Pre-test the .glb mesh load + raycast on Sat 14:30** — if the CESIUM_RTC normalization isn't solved by 16:00, switch to the collider-fallback approach. Don't keep grinding.
- **Golden demo dataset is built before sleep on Sat night.** No Sunday morning gambles.
- **The AI auto-fills Reonic's exact form fields with German labels.** Don't invent new fields. Don't translate "Aufständerung" to "elevation" — it stays German in the demo.
- Speed and Brazil framing are dead. Do not say "30 seconds" or "Brazil" in the pitch.
- Every quote variant shows projected margin + substitution confidence + rationale + **annual yield (kWh/kWp) + roof area (m²)**. No naked price quote.
- Every "Why this wins" rationale cites at least one concrete pattern from the dataset (project ID, brand frequency, margin band, line-item co-occurrence).
- **Every roof face exposed in the UI shows: area (m²), pitch°, azimuth°, annual flux (kWh/m²/yr), shading loss %.** Measurements + shading are table-stakes parity with OpenSolar/Aurora — not optional.
- **Installer is always the hero.** Homeowner mode never has a "buy now" CTA. Every homeowner CTA routes via an installer.
- **Homeowner form is capped at 4 fields.** Anything else gets inferred or deferred.
- **Installer Confidence Score badge appears on every homeowner screen** to keep the moat visible: *"Based on N Reonic projects within X km."*
- 3D mesh is supporting evidence in the installer pitch, but the *star* of the homeowner pitch. If the homeowner-mode 3D fails, the demo collapses into "another calculator."
- Pre-render every demo path. Live API calls only as a stretch flex.
- No credentials in the repo, ever.
- 3 partner techs picked at the hackathon, written into this README on the day.

## 7. Pre-Mortem
| Risk | Mitigation |
|---|---|
| The "installer DNA" rationale feels like generic LLM fluff | Hard-code 3 installer profiles from the 1,277 projects with concrete cited patterns. Deterministic beats magical on stage. |
| LLM proposes a BoM that doesn't fit the roof | Hard-constraint validator overrides LLM if face area or clearance fails; falls back to nearest historical-project layout |
| 3D mesh render breaks at the venue | Pre-render every hero address as a deterministic video/screenshot. Live 3D is optional flex. |
| Founder asks "isn't this just OpenSolar?" | Pre-empt: *"OpenSolar trains on 28k installers' generic patterns. Verdict trains on YOUR installers. Different product, defensible moat."* |
| Pioneer fine-tune temptation drains 8 hours | Don't, unless data prep is done by Sat 18:00 with margin to spare. KNN + structured output is enough. |
| Wifi dies at the venue | Full offline mode: every fixture cached locally, demo runs on `localhost`. |
| Solar API `dataLayers` rate-limit / cost spike | Pre-fetch the GeoTIFFs for the 4 German + 3 backup addresses; cache locally. Never call live in the demo. |
| Shading heatmap is GPU-heavy in browser | Pre-bake the heatmap textures from the GeoTIFFs into PNG overlays per face; load as a texture, not a live shader. |
| Roof-face measurement disagrees between mesh-derived and Solar-API-derived | Show both numbers in the UI side by side. Founders love seeing source agreement (or honest disagreement with explanation). |
| Homeowner roof loads slow / wrong building → "that's not my house" | Live demo runs ONLY on the 4 cached German addresses. Wrong-roof recovery is a "Move pin" button — but never demo the failure path. |
| Homeowner flow looks like it bypasses the installer | Every CTA routes via "Send to installer". Installer Confidence Score badge is visible in every screen. No "buy now" anywhere. |
| 4-field form feels too thin to founders | Side-mention "we infer or defer 14 other inputs" — show the inferred values in the installer view as proof we're not lying with our simplicity. |

## 8. Demo Addresses

**German drone meshes (3D moat + validator):**
- Hamburg `53.315578, 9.860276`
- North Germany `53.393029, 9.960488`
- Ruhr `51.145507, 7.109045`
- Brandenburg `53.307236, 7.545736`

**Satellite-path demo (3 backup addresses):** TBD at hackathon, verified via Solar API HIGH/MEDIUM coverage before locking.

---

*Trained on Reonic's installer DNA. Built in 24 hours. Defensible only because Reonic's data exists.*
