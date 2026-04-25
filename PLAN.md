# Verdict — Plan
*Big Berlin Hack 2026 · Reonic track · Submit Sun 14:00*

> Reonic's installer-DNA quote intelligence layer.
> **Live Google Solar API + Photorealistic 3D Tiles + Places + Geocoding all confirmed working** (probed 2026-04-25). Strategy: live-first with cached safety harbor.

---

## 1. Concept

**Verdict turns Reonic's automated technical plan into the quote an experienced installer would actually sell.** It is *automation + experience-based knowledge* — not "AI" in the marketing sense (Reonic itself never markets AI). Built on Reonic's proprietary 1,277 real projects + 19,257 line items, it predicts which hardware combination will actually get signed. Reonic already automates the layout. Verdict automates the commercial judgment that experienced installers still do by hand.

## 2. The 5-Minute Pitch (verbatim)

> **(0:00 — Hook)** "Reonic already automates the technical plan — the layout, the strings, the inverter sizing, the BoM. What's still done by hand is the *commercial judgment*: which BoM will the customer actually sign, at what margin? Verdict automates that — using your own 1,277 completed projects."

> **(0:30 — The familiar surface)** *Open Verdict on a phone — homeowner mode. A clean dark hero. One field: "Enter your address." Conrad types in his Hamburg address.*
>
> "We rebuilt this layer in 24 hours so it sits *in front of* the workflow Reonic already ships."

> **(1:00 — The reveal)** *The camera flies down through a neighborhood. Conrad's actual roof locks into focus. Black panels snap onto the south face. A single big number fades in: "You save approx. €142 / month." Three variant cards stamp in below: **Best Margin · Best Close Rate ★ · Best Lifetime Value**.*
>
> "Every variant is anchored in Reonic's data — 1,277 real projects, 19,257 line items, this region's actual brand bias. Reonic gave us the layout. Verdict picks the BoM the homeowner will actually sign."

> **(1:30 — The "Why this wins" reveal)** *Tap the recommended card.*
>
> "Verdict says: *'Best Close Rate — projects #882, #1041, #1198 used a similar Huawei-led BoM in the 8–12 kWp band, all closed at 28–31% margin. Risk: homeowner may reject 12 kWh battery on price; counter with FoxESS bundle from project #842 where a similar household closed at –€800 down payment.'*"
>
> "Try that on OpenSolar Ada — they have 28k generic installers' patterns. We have *yours*. Different product."

> **(2:00 — Live measurement + the "any urban address" finale)** *On the same phone, type a different German address (Reichstag, or a judge's address). Camera flies in via Google Photorealistic 3D Tiles. Solar API roof segments highlight in neon — 2 faces, 26.6 m², 7° pitch, 226° azimuth — with annual sunshine numbers on each. Variant cards re-stamp.*
>
> "Verdict starts from a live address, not a survey form. We pull Google's roof geometry and shading model in seconds, then layer Reonic's installer DNA on top. **Same engine. Same 4 fields. Same Reonic-grounded BoM.** Aurora gets you irradiance per panel; Verdict gets you the same plus the installer-DNA reasoning underneath. Cinematic drone meshes are the long-term moat for Reonic's hero customers; live tiles are how it scales to every address in Germany."

> **(2:30 — Send to installer)** *Conrad taps "Send to a certified Reonic installer." A confirmation slides in: "Verdict sent · Müller Solartechnik will review your proposal."*

> **(3:00 — Installer-in-the-loop, screen flips to a tablet view)** *A new lead card stamps into the installer's inbox: "Conrad Smith · 22,100 € · Verdict pre-qualified · Best Close Rate."*
>
> "This is what makes the loop real. Installers pay €50–200 today for a generic solar lead — just an address and a bill amount. A **Verdict-Qualified Lead** carries measured roof, demand, intent, and a Reonic-grounded BoM with cited similar projects. **Worth 5× a generic lead, because the installer can quote in minutes instead of days.**"

> **(3:30 — Installer reviews & adjusts)** *Tap the card. The installer sees the same 3D house Conrad saw, the recommended BoM, the 3 cited projects. They swap one component — a different battery brand they prefer — and hit **"Recalculate"**. The variant numbers re-flow in real time. Confidence dots update.*
>
> "Reonic's installers stay in control. Verdict drafts; the installer signs off. *Automation + experience-based knowledge — not autopilot.*"

> **(4:00 — The second touch lands back on the homeowner phone)** *Switch back to Conrad's phone. A push notification arrives: "Your Verdict has been finalized — Müller Solartechnik approved your proposal." The card now shows the installer's logo and the slightly adjusted final BoM.*
>
> "One round-trip. Homeowner to installer to homeowner — under 60 seconds in the demo, under 24 hours in production. **That's Reonic's second revenue line: intake-as-a-service on top of installer SaaS.**"

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

## 4a. Two User Modes — Homeowner (entry) and Installer-in-the-loop (must-demo)

Verdict ships in **two modes that share the same engine, and we demo the full loop end to end.** The homeowner enters at the front door; the installer reviews and approves before anything is final; the homeowner sees the approved result. **Both modes are must-demo. Neither is stretch.**

### The commercial framing (use this in the founder pitch)
Installers in DE pay €50–200 for a generic solar lead today (just an address + maybe a bill amount). A **Verdict-Qualified Lead** carries: measured roof geometry, real demand profile, EV + heating intent, customer goal, *and* a Reonic-grounded recommended BoM with cited similar projects. **A Verdict lead is worth 5× a generic lead because the installer can quote in minutes instead of days.** This is the second revenue line for Reonic: *intake-as-a-service* on top of the existing installer SaaS.

### Homeowner mode = Lead Intake → Verdict-Qualified Lead
**Pattern B: Roof-first, form on the side.** The roof is the canvas. The form is the controls. As the homeowner fills fields, the visualization mutates in real time. Conceptually two phases:

#### Phase A — Lead Intake (what the homeowner is doing)
1. Lands on the page → sees an example roof rotating with panels.
2. Address input — Google Places **autocomplete** primary; pin-nudge fallback ("Wrong roof? Move pin").
3. Building footprint highlights on a satellite basemap with the 3D mesh on top → micro-confirm **"Is this your home? · Yes / Adjust pin"**.
4. Side panel reveals **MAX 4 fields**:
   - Monthly electricity bill (slider, € or kWh)
   - EV: yes/no toggle
   - Heating: gas / oil / district / electric heat pump (icon row)
   - Primary goal: *Lower my bill* / *Become independent* (toggles whether the engine optimizes for ROI or autarky)
5. Each field mutates the 3D scene + 3 quote cards in real time. EV toggle materializes a wallbox; bill slider adds/removes panels; goal toggle swaps the recommended battery size.
6. **Installer Confidence Score badge** above the cards: *"Based on 41 Reonic projects completed within 5 km of your home."* This is the bridge back to the moat.

#### Phase B — Lead Qualification & Handoff
7. CTA: **"Send to a certified Reonic installer"** → generates a Verdict-Qualified Lead packet containing:
   - Address + lat/lon + measured roof faces (area, pitch, azimuth)
   - Demand profile from bill
   - Intent (EV, heating, goal)
   - Recommended BoM variant the homeowner picked + the other 2 for context
   - Cited similar Reonic projects
   - Verdict Link (unique URL the installer can open to see the same view)
8. Confirmation screen: "Verdict sent · Müller Solartechnik will respond within 24 hours."

### Installer-in-the-loop mode (must-demo)
9. Installer opens the lead in their inbox — sees the same 3D house, the recommended BoM, the 3 cited projects, the homeowner's intent.
10. Editable: installer can swap any component (panel SKU, battery model, inverter brand) and hit **"Recalculate"** — re-runs the sizing engine, re-validates against the hard rules, re-shows variants. Confidence dots update live.
11. Installer hits **"Approve and send to homeowner."**
12. **Second touch on the homeowner phone**: push notification + updated card showing the installer's logo and the final approved BoM. *"Your Verdict has been finalized — Müller Solartechnik approved your proposal."*

### Hard rules for the full loop
- Never collect more than 4 fields in homeowner Phase A. Infer or defer everything else.
- Never offer a deposit, payment, or "buy now" CTA — legally and operationally risky in DE.
- Never imply the homeowner can bypass the installer. Every CTA routes through one.
- Mobile-first — homeowners are on phones at the kitchen table.
- Every lead must include the structured packet above. No raw "address + bill" leads — that's what other platforms do.
- The installer can edit but never override the hard validation rules (70% feed-in cap, inverter ratio, roof fit). If they try, the recalc rejects with a flag, not a silent fail.

## 4b. Solar API is the primary source of truth (pivoted 2026-04-25)

**Pivoted after probing the live APIs.** Solar API works for any urban German building and returns roof segments + annual/monthly flux GeoTIFFs natively. Triangle-normal mesh clustering is now **dropped from the build** — Solar API gives us roof geometry for free, in seconds, with shading included. We save those hours for the installer-edit UX and demo polish.

| Signal | **Primary: Solar API** (live for every demo) | Fallback / cross-check (Ruhr.glb only) |
|---|---|---|
| Face area (m²) | `buildingInsights.roofSegmentStats[i].stats.areaMeters2` | Mesh-derived, only on Ruhr |
| Pitch / azimuth | `buildingInsights.roofSegmentStats[i].pitchDegrees / azimuthDegrees` | Mesh normal vector, only on Ruhr |
| Max panel count | `buildingInsights.solarPotential.maxArrayPanelsCount` | n/a |
| Annual flux (kWh/m²/yr) | `dataLayers.annualFluxUrl` GeoTIFF | n/a |
| Monthly flux | `dataLayers.monthlyFluxUrl` GeoTIFF (12 bands) | n/a |
| Shading mask | `dataLayers.maskUrl` + `dsmUrl` (free) | n/a |
| Imagery freshness | `imageryDate` (e.g. 2022-07-25) | Drone-mesh date |

**The cm-precision drone mesh** (Ruhr.glb) is now the *cinematic intro hero* — used to open the demo with one polished, drone-quality fly-in — then we live-pivot to "type any urban address" demonstrating the same flow on Photorealistic 3D Tiles + Solar API. Source-agreement on Ruhr.glb (mesh-derived ≈ Solar-API-derived) becomes a 5-second proof point, not a workstream.

**Why we're not building two pipelines anymore**: 3 of 4 .glb addresses are rural and have no Solar API coverage. We had two choices — re-bind the demo to addresses that work for both, or accept Solar API as the universal source. We picked the latter, and we keep Ruhr.glb only as the "look how good the mesh is when we have it" intro flex.

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
- Apartment / shared roof → flag as out-of-scope ("co-owner association required")
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

## 4d. Coordinates → 3D House Pipeline — LIVE-FIRST (pivoted 2026-04-25)

**Live by default. Cached only as safety harbor.** Confirmed working with the new Maps key:
- Places API (New) → autocomplete returns lat/lon
- Map Tiles API → Photorealistic 3D Tiles render in Germany via CesiumJS
- Solar API → `buildingInsights` returns roof segments + `dataLayers` returns annual/monthly flux GeoTIFFs

| Step | Live path (default for every address) | Safety harbor (when live fails) |
|---|---|---|
| 1 — Coordinates | Google Places Autocomplete → lat/lon | "Use my location" geolocation as secondary; or one of 4 pre-warmed addresses (Reichstag, Berlin Charlottenburg, Hamburg city, Munich) one tap away |
| 2 — House render | CesiumJS + Photorealistic 3D Tiles, staged "Finding property · Loading 3D view · Detecting roof faces" loader to hide tile latency | If 3D Tiles haven't returned in 4 seconds → static satellite tile + Solar API polygons overlaid (no fly-in animation) |
| 3 — Roof faces | Live `buildingInsights` → `roofSegmentStats` polygons (pitch, azimuth, area, sunshine quantiles) + `dataLayers` annual flux GeoTIFF for shading heatmap | Cached fixture for the 4 pre-warmed addresses |
| 4 — Trust micro-confirm | "Is this your home, 12 Sample Street? · ✓ Yes / ↻ Adjust pin" | Same UI; pin-nudge fallback if Solar API picked the wrong building |
| 5 — Live/Cached badge | Shows **🟢 Live** when Solar API returned in <3s | Shows **🟡 Cached** when fallback kicked in — never silent |

### The cinematic intro (only flex left for the .glb)
The demo OPENS on **Ruhr.glb** — the one cached drone mesh that also has Solar API coverage — for the most polished cinematic fly-in. After 4 seconds of "look how detailed cm-precision drone is", the user types a different address and we live-pivot. Drone mesh = aspirational moat for Reonic's heavy-investment customers; live tiles = how Verdict scales to every German postcode.

### .glb coverage reality (don't pretend)
- Hamburg.glb (53.315578, 9.860276): rural Niedersachsen, **NO Solar API coverage** (404)
- Brandenburg.glb (53.307236, 7.545736): rural, **NO Solar API coverage**
- NorthGermany.glb (53.393029, 9.960488): rural, **NO Solar API coverage**
- Ruhr.glb (51.145507, 7.109045): **HAS Solar coverage** (200) ← the only one we use

### Pre-warmed safety addresses (Saturday night fixture)
- Ruhr (matches Ruhr.glb cinematic) — ETRS89/UTM-32N anchor confirmed
- Reichstag, Berlin (Pariser Platz, 52.516275, 13.377704) — landmark, judges recognize
- Berlin Charlottenburg (52.49765, 13.255) — residential detached house with 2 roof segments confirmed
- Hamburg city centre (53.5511, 9.9937) — mid-size urban building, 71 panels max
- Munich (TBD at hackathon — verify Solar API coverage before locking)

**Fallback ladder:** (a) 3D Tiles slow → static satellite tile with Solar polygons overlaid, (b) Solar API 404 → fall back to Places' returned building footprint + manual roof rectangle, (c) Geolocation denied → Places autocomplete only.

## 4e. Homeowner site — Lead Intake wireframe

This is what the customer sees, in order. **Screens 1–3 are Phase A (Lead Intake). Screens 4–7 are Phase B (Lead Qualification + Handoff). Screens 8–10 are the installer-in-the-loop touchpoints.**

### PHASE A — LEAD INTAKE

**Screen 1 — Landing (full bleed)**
```
              What would a solar system cost for your home?

              ┌──────────────────────────────────────┐
              │ 📍 Enter your address...             │
              └──────────────────────────────────────┘

                     or  ⌖ Use my location

              "Verdict — 41 Reonic projects already
               completed within 5 km"
```

**Screen 2 — Cinematic fly-in (3 seconds)**
```
   [3D camera swoops from atmosphere down to oblique 45° view]

   "Property found · Loading 3D view · Detecting roof faces"
```

**Screen 3 — House confirm + Live Roof Facts + 4-field side panel**
```
┌────────────────────────────────┬────────────────────────────────┐
│                                │ 12 Sample Street, Hamburg      │
│                                │ Is this your home?             │
│   [3D mesh of house            │ [ ✓ Yes ] [ ↻ Adjust pin ]     │
│    slowly rotating,            │                                │
│    pulsing pin on roof,        │ ┌── 🟢 Live roof facts ──────┐ │
│    Solar API roof segments     │ │ 2 roof faces measured      │ │
│    glowing in neon overlay]    │ │ 26.6 m² · 7° pitch · 226°  │ │
│                                │ │ Imagery: Jul 2022 · 🟢     │ │
│                                │ └────────────────────────────┘ │
│                                │                                │
│                                │ Electricity bill / month       │
│                                │ ●━━━━━━━━━━━ €120              │
│                                │                                │
│                                │ ⚡ Electric vehicle            │
│                                │   ◯ No   ◉ Yes                 │
│                                │                                │
│                                │ 🔥 Heating                     │
│                                │   ◉ Gas ◯ Oil ◯ HP ◯ District  │
│                                │                                │
│                                │ 🎯 Goal                        │
│                                │   ◉ Lower my bill              │
│                                │   ◯ Become independent         │
└────────────────────────────────┴────────────────────────────────┘
```

The **"Live roof facts"** strip is sourced directly from Solar API `buildingInsights.roofSegmentStats` and `imageryDate`. It converts the cinematic 3D wow into mathematical trust: *"we did not guess, we measured."* The `🟢 Live` badge flips to `🟡 Cached` if we fell back to a fixture — never silent.

### PHASE B — LEAD QUALIFICATION + HANDOFF

**Screen 4 — Three variants stamp in (panels animate onto the roof)**
```
┌────────────────────────────────────────────────────────────────┐
│         [3D house with panels animating into place]            │
├────────────────────┬─────────────────────┬─────────────────────┤
│  Best Margin       │  Best Close Rate ★  │  Best Lifetime Value│
│                    │     Recommended     │                     │
│   9.5 kWp          │   11.4 kWp          │   13.8 kWp          │
│   6 kWh battery    │   9 kWh battery     │   12 kWh + HP       │
│   Huawei + EcoFlow │   Huawei + EcoFlow  │   Huawei + Vaillant │
│                    │                     │                     │
│   €18,400          │   €22,100           │   €31,800           │
│   Payback 10.2 yrs │   Payback 8.8 yrs   │   Payback 11.4 yrs  │
│                    │   KfW-eligible      │   KfW-eligible      │
│                    │                     │                     │
│   [   Select   ]   │   [   Select   ]    │   [   Select   ]    │
└────────────────────┴─────────────────────┴─────────────────────┘
```

**Screen 5 — "Why this wins" expandable (after click)**
```
"Best Close Rate — Verdict suggests this variant because:
 ▸ Projects #882, #1041, #1198 (8–12 kWp range) all closed
   with the same Huawei + EcoFlow configuration
   (margin 28–31%)
 ▸ Risk: 9 kWh battery price may trigger rejection
   → Alternative: FoxESS bundle (project #842, –€800 down)
 ▸ KfW 270 eligible"
```

**Screen 6 — CTA**
```
              [ Send to a certified Reonic installer ]
                                    ↓
        Generating Verdict link · Müller Solartechnik
        will receive your proposal within 24 hours
```

**Screen 7 — Confirmation (homeowner)**
```
          ✓  Verdict sent
          Müller Solartechnik is reviewing your proposal.

          We'll notify you when the installer has approved
          the final system. Usually within 24 hours.

          [ Download Verdict packet as PDF ]
```

### INSTALLER-IN-THE-LOOP (must-demo)

**Screen 8 — Installer inbox (tablet view)**
```
┌────────────────────────────────────────────────────────────────┐
│ Müller Solartechnik · Inbox                          🔔 3 new  │
├────────────────────────────────────────────────────────────────┤
│ ★ Conrad Smith — Hamburg                            just now   │
│   €22,100 · Verdict pre-qualified · Best Close Rate            │
│   11.4 kWp · 9 kWh · Huawei + EcoFlow                          │
│   🟢 Roof measured  🟢 Demand profile  🟡 Heat pump option     │
│                                          [ Open Verdict → ]    │
└────────────────────────────────────────────────────────────────┘
```

**Screen 9 — Installer review + edit (same 3D house Conrad saw)**
```
┌────────────────────────────────┬────────────────────────────────┐
│                                │ Bill of Materials              │
│                                │ ───────────────                │
│   [Same 3D mesh, panels        │ Panels  Huawei LR7 ×24  ✏️     │
│    visible, sun-path           │ Inverter SUN2000-10KTL  ✏️     │
│    overlay toggleable]         │ Battery  EcoFlow 9 kWh  ✏️     │
│                                │ Mount    Schletter K2   ✏️     │
│                                │                                │
│   Roof face 1: 42.1 m² · 32°   │ Cited Reonic projects:         │
│   Annual yield: 1,080 kWh/kWp  │ #882 · #1041 · #1198           │
│                                │                                │
│                                │ [ Recalculate ]                │
│                                │ [ ✓ Approve and send ]         │
└────────────────────────────────┴────────────────────────────────┘
```

**Screen 10 — Second touch on the homeowner phone (the magic)**
```
          🔔 Your Verdict has been finalized

          Müller Solartechnik has approved your proposal.

          ┌──────────────────────────────────────────┐
          │ [ Müller Solartechnik logo ]             │
          │                                          │
          │ Final system · 11.4 kWp + 9 kWh          │
          │ €22,100 · Payback 8.8 years              │
          │ Installation slot: late June             │
          │                                          │
          │ [ Open final proposal → ]                │
          └──────────────────────────────────────────┘
```

## 4c. Build Order — Homeowner MVP + installer-in-the-loop must-demo

**Pivoted: the homeowner side is the MVP, AND the installer-in-the-loop step is must-demo (not stretch).** The full loop is what makes the pitch land — without the installer touchpoint, Verdict looks like just another homeowner calculator.

### Stage 1 — Homeowner MVP (must ship — Phase A + Phase B)
The homeowner-facing site, end to end. Address → cinematic house reveal → 4-field intake → recommended variant + 2 alternatives → "Send to installer" CTA → handoff confirmation.

Concrete sub-deliverables:
1. **Hero landing** — full-bleed cinematic 3D German roof with sunlight sweeping panels onto it; one large address autocomplete input; subcopy citing Reonic data ("Based on 1,277 real Reonic projects").
   - **Hero copy (locked)**: *"Your home can earn more than you're currently losing on energy."*
   - **Opening 3 seconds (locked)**: black screen → thin neon scan line sweeps across a dark 3D neighborhood → one house locks into focus from above → roof edges glow → panels snap onto the roof with quiet precision → monthly savings number fades in *before* anything else.
2. **Cinematic house reveal** (2.8 sec) — staged "Property found · Loading 3D view · Detecting roof faces" loader; cross-fade from satellite top-down → cached `.glb` mesh oblique view; pulsing pin + address label; "We found your roof."
3. **House interaction = guided, not free** — drag-rotate slightly, pinch-zoom, three preset views ("Roof / Street / Modules"). NO free CAD camera.
4. **4-field intake (stepper, locked)** — Zip code (5-digit numeric) · Electricity cost / month (€ slider, default 120) · Heating system (segmented: Gas · Oil · Heat pump · Other) · Special needs (multi-select chips: EV · Pool · Home office). Each field updates 3D scene live.
5. **The Verdict reveal — recommended-card layout (locked, top-to-bottom)**:
   1. Variant label badge: **Best Close Rate ★** (small, uppercase, neon accent)
   2. Big savings number: **"You save approx. €142 / month"** (32px+, dominant)
   3. Horizontal payback timeline (Year 0 invest → Year 8 break-even → €38,400 over 25 years)
   4. Component summary row with traffic-light dots: **🟢 PV · 🟢 Storage · 🟡 Heat pump**
   5. Three one-line trust bullets: *"fits on the roof" · "fastest payback" · "installer-ready"*
   6. **"Why this recommendation?" reveal drawer** — opens to show 3 cited Reonic project IDs + the brand-prior reasoning + the objection-prediction
   7. Primary CTA button (full-width)

   Two alternative variants collapsed below as compact cards: **Best Margin** and **Best Lifetime Value**.
6. **Surprise & delight (locked)** — animated panel snap with per-face count labels; bill transformation (€220 → €78); CO2 → trees ("34 trees in the Black Forest"); **viral spouse-share card**: *"Honey, our roof is losing about €142 every month."* with the rendered house, payback timeline, and "Installer-ready in 60 seconds" footer.
7. **Trust block** — citations: 2-3 similar Reonic projects ("Similar to projects #882, #1041 in Hamburg"); explicit "No credit check, no income, no obligation" line; brand transparency (Huawei + EcoFlow logos visible).
8. **Handoff CTA (locked)** — primary button **"Send to a certified Reonic installer"** + microcopy *"non-binding · no phone call · the installer receives your Verdict packet (roof measurement, demand, recommended system) and can quote immediately."*
9. **Confirmation screen** — animated "Verdict sent · Müller Solartechnik will respond within 24 hours" + optional "Download Verdict packet as PDF".

**Tech stack**: Next.js + react-three-fiber + drei (`useGLTF` + DRACOLoader); shadcn/ui + react-hook-form for the stepper; Gemini 2.5 Pro for variant generation + rationale; KNN retrieval over `projects_status_quo.csv` + `project_options_parts.csv`; Google Places autocomplete; Google Solar API `buildingInsights` cached for the 4 demo addresses.

**Stage 1 killer trap**: `.glb` files are Draco-compressed + geo-anchored via `CESIUM_RTC`. **First task** Saturday: load each .glb, normalize origin to mesh center, smoke-test camera framing on all 4 — before any UI work.

**Mobile-first**: single column, thumb-first, 3D pinned to top 40% of viewport, sticky bottom CTA. Demo on phone-portrait.

**7-hour Stage 1 cut list** (in order of expendability): spouse-share card → CO2 trees → bill transformation → preset views. Floor: mesh loads, address triggers reveal, 4 fields update one variant card, send button shows confirmation.

### Stage 2 — Installer-in-the-loop (must-demo, was stretch)
**Promoted from stretch to must-demo.** Without the installer touchpoint the pitch is a calculator; with it, the full revenue-line story lands.

Three screens, mirroring Screens 8/9/10 in the wireframe:
- **Inbox card** (Screen 8) — Conrad Smith lead arrives with traffic-light component dots, opens into the same 3D view the homeowner saw.
- **Review + edit + Recalculate** (Screen 9) — installer can swap any BoM component; **"Recalculate"** re-runs the deterministic sizer, re-validates against the hard rules (70% feed-in cap, inverter ratio, roof fit), and updates the variant numbers + confidence dots live.
- **Approve and send** → triggers Screen 10: a push-style notification on the homeowner phone with the installer-approved final BoM and installer logo.

Time budget: 4-5h. If Stage 1 polish needs more time, drop to a static screen-flip animation for the loop (still demo-able from a slide deck).

### Stage 3 — AI brain depth (cut if late)
"Why this wins" expandable on each variant card, citing 3+ real project IDs and one objection-prediction. Validator delta badge ("vs. typical Reonic quote: +€620 margin, 2.1 years faster payback").

### Stage 4 — Pure polish (cut if late)
- Sun-toggle for live shading on the mesh (procedural, not GeoTIFF)
- "Download Verdict packet as PDF" — 4-page beautifully formatted lead packet PDF (huge for shareability)

### Demo fallback ladder
| Stage 1 only | Homeowner-MVP demo only: address → reveal → intake → recommended variant → handoff confirmation. Pitch lands but the loop is missing — explain the installer-in-the-loop step verbally over a slide. |
| Stage 1 + Stage 2 | **Target.** Full loop: homeowner → installer review → second touch on homeowner phone. Reonic founders see the revenue line. |
| Stage 1 + Stage 2 + Stage 3 | Adds AI depth ("why this wins" with citations + objection prediction). |
| All four | Adds shading + PDF download for shareability. |

### Golden demo dataset (precompute Saturday night)
Live AI **enhances** the demo, never **gates** it. Tonight, precompute and freeze:
- 1 selected mesh (recommend Hamburg.glb — smallest, 5 MB)
- 3 roof faces with normalized planes + collider fallback
- 3 variant cards with full BoM, ROI numbers, rationale text — cached as static JSON
- 5 nearest historical project IDs for the cited-similar block
- Google Places + Solar API responses for the chosen address — cached locally
- **Installer-edit fixture**: the "after recalc" state with one swapped component (e.g. battery brand swap), pre-baked so Recalculate visibly changes numbers without depending on a live LLM call.

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
| **Stage 1 — Homeowner UI** | Cinematic landing, 3D reveal, 4-field intake, variant cards, recommended-card layout, send-to-installer CTA, confirmation screen | **Lovable** for v0; manual override for the 3D and form micro-interactions |
| **Stage 2 — Installer-in-the-loop UI** | Inbox card, review-and-edit screen with editable BoM rows, Recalculate button (calls deterministic sizer), Approve-and-send action, push-style second-touch on the homeowner phone | (extends Stage 1, no new framework) |
| **Stage 3 — AI brain depth** | "Why this wins" expandable on each variant card; objection prediction; validator delta badge | **Gemini** structured output |
| **Live Solar API integration (replaces mesh clustering)** | Wire `buildingInsights` for roof segments + `dataLayers` for annual/monthly flux GeoTIFFs. Bake heatmap textures from the GeoTIFFs into PNG overlays per face (loaded as Three.js textures, not live shaders). Provide a typed TS client + a Live/Cached badge component. **Triangle-normal mesh clustering is dropped** — Solar API gives us the same outputs natively in <2s per address. | Google Solar API `buildingInsights` + `dataLayers`; CesiumJS for 3D Tiles; Sharp for GeoTIFF→PNG bake |
| **Pitch & Stage Choreography** | 5-min script, 2-min Loom, slide deck, competitor-contrast framing, backup script for tech failures, repo polish | **Aikido** scan + screenshot for the side prize |

## 5b. Visual aesthetic + anti-patterns

**Vibe**: Tesla precision meets German banking trust. Dark hero (Tesla feel). Light, calm, high-contrast interior (banking trust). Inter or SF typography. Single neon accent color for energy/yield. Zero marketing fluff. Premium 3D as the dominant visual, not stock photos.

**Anti-patterns — never do these**:
- ❌ kWp / inverter brands / BoM jargon in homeowner copy. Use *system size*, not *kWp*.
- ❌ Phone number / income / age fields anywhere in intake.
- ❌ Generic stock solar imagery after the homeowner has typed an address (use their actual roof or nothing).
- ❌ Three equal choices with no recommendation — homeowners want guidance, then comparison.
- ❌ Spinners and loading splashes — use staged labels ("Detecting roof faces") or skeleton screens.
- ❌ Vague pricing — show a range with monthly equivalent.
- ❌ Popups, modals, sales-call CTAs.
- ❌ Free-fly camera for non-technical users — guided controls only.
- ❌ Asking the homeowner what *kind* of solar tech they want — that's our job.

## 6. Hard Rules
- **Stage 1 (homeowner Phase A + Phase B) ships before any Stage 2 work begins.** Stage 2 (installer-in-the-loop) is must-demo but cannot start until the homeowner side is end-to-end clickable.
- **The first personalized reveal is the obsession.** When the cached `.glb` of the demo address fades in and the homeowner says "that's my house" — everything else is secondary. Mesh fidelity = mathematical trust.
- **The LLM never outputs geometry.** Coordinates, panel counts, placement positions all come from a deterministic placer. The LLM's only job is choosing the BoM (which SKU, which brand, which battery size) and writing the rationale.
- **Don't sell "AI" first.** Reonic doesn't market AI; Verdict shouldn't either. Pitch as *automation + experience-based knowledge*. AI is the mechanism, not the headline.
- **Variant naming**: *Best Margin · Best Close Rate · Best Lifetime Value*. Not "Budget/Balanced/Premium". Outcome-named, not template-named.
- **Honor what Reonic owns**: never duplicate Reonic's automated roof layout, automated stringing, inverter sizing, or KfW funding workflow. Demo says: "We start *before* and *after* Reonic's automation. Verdict captures the lead and surfaces the commercial package."
- **KfW eligibility as a flag, not a calculator.** Show "Variant 2: KfW-relevant — likely eligible for Reonic's funding workflow." Never quote a specific rate live (legally risky if wrong).
- **Each variant rationale also flags one objection-prediction**: "Risk: homeowner may reject battery price; counter with project #X."
- **All 5 golden test profiles must pass ±10% on panel count before Stage 2 work begins.** If formulas drift, fix them before adding features.
- **German 70% feed-in rule is a hard cap**, not a suggestion. If a variant violates it, the variant is rejected — never shown to the user. The installer cannot override this in Stage 2 either.
- **Every "Why this wins" rationale cites at least 3 real project IDs from the dataset.** No vague "this works well" filler.
- **Cache every API response** to SQLite or JSON fixtures the moment it works. Live calls only as a stretch flex.
- **Pre-test the Solar API + 3D Tiles flow on Sat 14:30** — type 5 random German addresses, confirm `buildingInsights` returns roof segments and 3D Tiles render in <4s. If 3D Tiles latency exceeds 4s on average, lock the demo to the 4 pre-warmed addresses + Ruhr.glb cinematic.
- **Pre-test Ruhr.glb load on Sat 14:30** (only mesh we still ship). CESIUM_RTC normalization for the cinematic intro must be solved before any UI work.
- **Golden demo dataset is built before sleep on Sat night.** Pre-fetch + cache: Ruhr + 4 safety addresses (Reichstag, Berlin Charlottenburg, Hamburg city, Munich) — full `buildingInsights` JSON, `dataLayers` URLs followed and saved as PNG heatmaps per roof face, `Places` autocomplete responses. No Sunday morning gambles.
- **All API responses route through a Live/Cached badge.** Every Solar/Tiles call is wrapped in a 4-second timeout. On timeout or error, fall back to fixture and flip the badge to 🟡 Cached. Never silent. Founders see source-honesty.
- **All UI is in English.** Reonic is a German company and we keep their German feature names when referencing them, but the Verdict product UI itself is English (homeowner side and installer side).
- Speed and Brazil framing are dead. Do not say "30 seconds" or "Brazil" in the pitch.
- Every quote variant shows projected margin + substitution confidence + rationale + **annual yield (kWh/kWp) + roof area (m²)**. No naked price quote.
- Every "Why this wins" rationale cites at least one concrete pattern from the dataset (project ID, brand frequency, margin band, line-item co-occurrence).
- **Every roof face exposed in the UI shows: area (m²), pitch°, azimuth°, annual flux (kWh/m²/yr), shading loss %.** Measurements + shading are table-stakes parity with OpenSolar/Aurora — not optional.
- **Installer is always the gatekeeper.** Homeowner mode never has a "buy now" CTA. Every homeowner CTA routes via an installer, who must approve before the final BoM is sent back to the homeowner.
- **Homeowner form is capped at 4 fields.** Anything else gets inferred or deferred.
- **Installer Confidence Score badge appears on every homeowner screen** to keep the moat visible: *"Based on N Reonic projects within X km."*
- 3D mesh is supporting evidence in the installer screen, but the *star* of the homeowner pitch. If the homeowner-mode 3D fails, the demo collapses into "another calculator."
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
| Founder asks "why isn't the installer just using Reonic's own planner?" | Answer: *"They are — Verdict is the front-door for leads and the back-door for sign-off. Reonic's planner does the technical work in the middle."* |
| Pioneer fine-tune temptation drains 8 hours | Don't, unless data prep is done by Sat 18:00 with margin to spare. KNN + structured output is enough. |
| Wifi dies at the venue | Full offline mode: every fixture cached locally, demo runs on `localhost`. |
| Solar API `dataLayers` rate-limit / cost spike | Pre-fetch the GeoTIFFs for the 4 German + 3 backup addresses; cache locally. Never call live in the demo. |
| Shading heatmap is GPU-heavy in browser | Pre-bake the heatmap textures from the GeoTIFFs into PNG overlays per face; load as a texture, not a live shader. |
| Roof-face measurement disagrees between mesh-derived and Solar-API-derived | Show both numbers in the UI side by side. Founders love seeing source agreement (or honest disagreement with explanation). |
| Homeowner roof loads slow / wrong building → "that's not my house" | Live demo runs ONLY on the 4 cached German addresses. Wrong-roof recovery is a "Move pin" button — but never demo the failure path. |
| Homeowner flow looks like it bypasses the installer | Every CTA routes via "Send to installer". Stage 2 makes the installer-approval step unmissable. Installer Confidence Score badge is visible in every screen. No "buy now" anywhere. |
| 4-field form feels too thin to founders | Side-mention "we infer or defer 14 other inputs" — show the inferred values in the installer view as proof we're not lying with our simplicity. |
| Installer Recalculate breaks live (bad LLM swap) | The Recalculate button calls the deterministic sizer, NOT the LLM. Demo runs even if Gemini is down. |

## 8. Demo Addresses

**Cinematic intro (only mesh we still ship):**
- Ruhr `51.145507, 7.109045` ← `.glb` cm-precision drone mesh + Solar API coverage confirmed (HTTP 200)

**Pre-warmed safety addresses (live 3D Tiles + Solar API, baked into golden fixtures):**
- Reichstag, Berlin (Pariser Platz, `52.516275, 13.377704`) — landmark, judges recognize
- Berlin Charlottenburg residential (`52.49765, 13.255`) — 2 roof segments confirmed (26.6 m², 7° pitch)
- Hamburg city centre (`53.5511, 9.9937`) — 71 max panels confirmed, 2020-04 imagery
- Munich TBD — verify Solar API coverage Saturday before locking

**Live "any address" finale**: type at the venue. Falls back to nearest safety address if Solar returns 404 or 3D Tiles latency >4s.

**Dropped addresses (rural, no Solar API coverage — kept only as visual mesh assets):**
- Hamburg.glb `53.315578, 9.860276` (404)
- Brandenburg.glb `53.307236, 7.545736` (404)
- NorthGermany.glb `53.393029, 9.960488` (404)

---

*Trained on Reonic's installer DNA. Built in 24 hours. Defensible only because Reonic's data exists.*
