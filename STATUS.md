# Verdict — Session Handoff for Next Window

> **Read this first.** Big Berlin Hack 2026, **Reonic track**. Submission deadline: **Sunday 2026-04-26 14:00 Berlin** (~10–11 hours away as of 03:05 Sun morning).
> Then read `AGENTS.md`, then `README.md`. Memory at `~/.claude/projects/-Users-georgenikabadze/memory/project_bigberlin_hackathon.md` has the hackathon-meta context (track rules, partner-tech list, side prizes).

---

## 🟢 Live state right now

| What | Where |
|---|---|
| GitHub HEAD | `c6158cf` on `main` at github.com/georgenikabadze-hub/verdict (about to push this handoff + InstallerMarketplace exact-view default) |
| Vercel prod | https://verdict-gamma-ten.vercel.app (latest deploy `verdict-c0ifinvfh` — alias updated, healthy) |
| Safety rollback tag | `pre-roof-rewrite-20260426-0243` → `762c79f` (last known-good before roof-aware sizing) |
| Local dev | `pnpm dev` at http://localhost:3000 (Tavily live, all features) |
| Mac sleep | `caffeinate -di -t 28800` running until ~09:14 Sun — laptop won't sleep on lid close |
| Codex research output | `/tmp/verdict_research.log` — completed, see "Research findings" below |

---

## ✅ Shipped this session (working)

**Sprint 5+6 (commit `762c79f`)**
- Installer **marketplace** (`app/installer/page.tsx` + `components/installer/InstallerMarketplace.tsx`) with lead list + Static-Maps satellite thumbnails + status pills + 🔒/🔓 debug toggle (now defaults to **🔓 Exact** for testing)
- **Privacy split** in `lib/leads/store.ts`: `publicPreview` vs `privateDetails`. Deterministic FNV-1a blur in `lib/leads/blur.ts` (250–500 m offset, computed once at lead creation)
- **InstallerLeadDetail** with Cesium 3D photoreal embedded + AI BoM (3 variants) + customer details that unlock on Accept
- API routes: POST `/api/leads`, POST `/api/leads/[id]/accept`, POST `/api/leads/[id]/offer`
- **SendToInstaller** wires real POST with intake + roofSegments; leadId persisted in localStorage; **InstallerApprovedToast** reads it back
- **Cesium snap-to-building**: 3-layer roof clip — OSM polygon → Solar API bbox snap (re-targets camera) → 25 m circle fallback with amber "Building not detected" warning
- **Tavily live tariff** (`lib/api/tavily.ts`): replaces hardcoded €0.32/kWh. **Live in dev** (verified €0.371/kWh for Berlin 14193). **In prod, runtime returns fallback after 30 ms despite env var being set — see Known Issues**.

**Sprint 7 (commit `c6158cf` — roof-aware sizing)**
- `lib/sizing/calculate.ts` upgraded: `panelCount = min(roof_fit_max, demand × 1.1)`. Usable segment = area > 10 m² AND (pitch < 5° OR azimuth ∈ [90, 270]). **Flat roofs are azimuth-agnostic** (tilted mounts) — fixes the case where a 220 m² ENE-facing flat roof would have been falsely skipped as "north-facing"
- New export `allocatePanelsToSegments()`: greedy yield-rank, MPPT strings clamped 4–25 panels, returns `SegmentAllocation[]` with `azimuthBucket`, `panelsAllocated`, `stringId`, `yieldKwhPerYear`, `status`, `skipReason`
- New `components/installer/SegmentBreakdown.tsx`: per-segment table with color-coded MPPT string pills
- **InstallerLeadDetail live recompute**: on mount, fetch `/api/roof-facts`, reconstruct `Intake`, call `sizeQuote` with **live** segments, replace KPI cards + variants. Pulsing dot during fetch. Silent fallback on error

**This last edit (uncommitted as of writing this handoff)**
- `components/installer/InstallerMarketplace.tsx`: exact-view toggle now defaults to **on** (was off). Testing always shows real building. The privacy-blurred mode is still selectable for the demo pitch — localStorage remembers explicit `0` to disable
- This file (STATUS.md) rewritten as a real handoff for the next window

**Verified**
- `pnpm tsc --noEmit` exit 0
- `pnpm test` 21/21
- 4-house parity test confirmed `/api/quote` and POST `/api/leads` produce identical sizing for the same intake (Hubertusbader 8 / Diedersdorfer 3 / Schlossstraße 70 / Tegeler Weg 5)

---

## 🔬 Codex research findings (high-reasoning, just landed)

Source: `/tmp/verdict_research.log`. Five top recommendations, ranked, with paste-ready agent prompts.

### Top 5 ship-in-3-hours improvements

| # | What | Effort | Risk | Why |
|---|---|---|---|---|
| 1 | **Use Google `solarPanels` array from `buildingInsights`** in `app/api/roof-facts/route.ts` and `allocatePanelsToSegments()` | M | low-med | Google's Solar API ALREADY returns per-panel placement (lat/lng/orientation/yearly kWh). We're ignoring it. This is the *single highest-leverage* change because Google has done the obstruction-aware placement for us |
| 2 | **Honor `annualSunshineHours` in `estimateYield()`** | S | low | We fetch `sunshineQuantiles[5]` already and stuff it into `RoofSegment.annualSunshineHours` — then ignore it in the yield model. Trivial fix. Shaded segments stop being treated equal to sunny ones |
| 3 | **PVGIS wrapper** (`lib/api/pvgis.ts` + `app/api/pvgis-yield/route.ts`) | M | low | Free EU API. Returns 12 monthly kWh. Renders as "monthly yield strip" in installer detail. Big jury win for "real-world data" |
| 4 | **`SunPathStrip.tsx`** — sun-path / monthly shading visual | M | low | Compact visual using PVGIS monthly data. Cute jury moment |
| 5 | **Low feed-in economics tuning** in `buildVariant()` / `calcSelfConsumedKwh()` | S-M | med | Penalize exported surplus when feed-in tariff is weak (German reality). Prevents LTV variant from oversizing just to fill roof |

### Top 5 papers cited (2023–2025)
- DOI `10.1016/j.compenvurbsys.2023.102026` — Rooftop segmentation + PV layout in DSMs (2023). **Validates Google `solarPanels` approach**
- DOI `10.3390/computation12060126` — Hourly modeling residential PV+HP (2024). Hourly self-consumption matters
- DOI `10.3389/fenrg.2023.1297356` — PV-battery sizing for peak demand (2023). Battery value depends on load timing
- DOI `10.3390/en18164405` — Optimal sizing under grid export constraints (2025). Don't fill roof if export tariff is weak
- DOI `10.3390/en18010119` — Enhancing rooftop PV segmentation (2025). Confidence matters; expose fallback honestly

### Things to DELIBERATELY NOT DO (codex was emphatic)
1. ❌ Don't extract obstruction polygons from Cesium 3D Tiles — multi-day mesh parsing
2. ❌ Don't integrate Aurora / EagleView / OpenSolar APIs before deadline — account/coverage too heavy
3. ❌ Don't build SAM raytracing in-app — needs explicit 3D geometry
4. ❌ Don't let Gemini infer panel geometry — keep geometry deterministic
5. ❌ Don't refactor `RoofSegment` / `SizingResult` field names — breaks demo

---

## 🚦 Submission readiness scoreboard

| Requirement | Status |
|---|---|
| Public GitHub repo with latest work | ✅ pushed at `c6158cf` (this handoff makes a new commit) |
| Comprehensive README | ✅ rewritten this session, 117 lines |
| 2-min Loom video demo | ❌ **MUST RECORD** — record on localhost (Tavily live there) |
| ≥ 3 partner technologies wired | ⚠ **2 of 3 confirmed** (Gemini, Tavily). User declared **Lovable as 3rd** — needs concrete artifact in repo. See item #1 below |
| Aikido side prize (€1k, "Most Secure Build") | ❌ not done. ~15 min: signup + connect repo + screenshot scan |

---

## 🔴 Open work — priority order for the remaining ~10 hours

### MUST DO (or no valid submission)
1. **Lovable artifact** (~10 min in browser). Use coupon `COMM-BIG-PVDK` at lovable.dev → prompt: *"Generate a dark-themed React card showing 3 solar variant comparison: Best Margin / Best Close Rate / Best LTV"* → paste output into `components/homeowner/VariantCardLovable.tsx` with header comment `// Generated initial scaffold via Lovable (Big Berlin Hack 2026)`. Mount somewhere visible. Required for the partner-tech count.
2. **Loom recording** (~30 min). Script in section below. Record on `localhost:3000` (Tavily live).
3. **BBHack submission form** (~10 min). Includes GitHub URL + Vercel URL + Loom URL + 1-paragraph project description.

### HIGH leverage (jury wow, low risk)
4. **Codex Research item #2 — `annualSunshineHours` in yield** (S, ~30 min). Smallest-effort highest-honesty win. Paste-ready agent prompt in `/tmp/verdict_research.log`.
5. **Codex Research item #1 — Google `solarPanels` consumption** (M, ~60 min). Highest single-leverage upgrade — replaces our derived panel placement with Google's actual obstruction-aware placement. The "we use Google's full Solar API stack" credibility moment.
6. **Cesium panel polygon overlay on photoreal mesh** (~2–3 h) — the **Reonic-style WOW**. Render `allocatePanelsToSegments()` output as `Cesium.GeoJsonDataSource` polygons on the live mesh. Should be additive: keep `PanelLayoutPreview` SVG as fallback toggle. **The Reonic photo (conv #14) shows their actual product does this with cm-precision drone meshes + draggable panel blocks**. Even a read-only version is enough for the demo
7. **Aikido scan** (~15 min) → €1k side prize

### NICE to have
8. Codex Research item #3 — PVGIS monthly yield strip (M, ~60 min)
9. Codex Research item #4 — SunPathStrip visual (M, ~60 min)
10. Server-side recompute persistence (POST `/api/leads/[id]/recompute`) so marketplace card thumbnails reflect live sizing too — currently only the detail view does (~30 min)
11. Replace 3 demo seed leads (Donaustraße/Chausseestraße/Dunckerstraße — all 1000+ m² Altbau) with the 3 verified single-family addresses (Hubertusbader 8 / Diedersdorfer 3 / Tegeler Weg 5) — user wanted ≤ 500 m² seeds (~5 min)

### KNOWN issues (OK to ship with)
- **Vercel prod runtime can't read `TAVILY_API_KEY`** at runtime even though `vercel env pull` shows it correctly. Latency stuck at 30–55 ms (helper bails at `if (!apiKey)`). Two redeploys didn't fix. **Workaround**: record Loom on localhost where Tavily IS live. Integration code in repo proves the partner tech is wired
- Demo seed leads' `publicPreview.roofFacts` and panel count are computed from `defaultSegments()` at seed creation — not the real building. **Live recompute on the detail view fixes this for what the installer sees**, but marketplace card thumbnails + KPI text still show stale seed numbers until item #10 above is done

---

## 🧠 Session learnings — what works for this AI workflow

- **High reasoning for architecture/audit, low or medium for execution.** Use `-c model_reasoning_effort=high` for codex planning runs. Default `medium` is fine for code edits with concrete specs.
- **Codex CLI doesn't stream**: it returns all output at exit. Pipe to a log file and use `Monitor` with `until ! pgrep -f "codex exec"` to be notified on completion. Don't pipe through `tail -200` — buffers everything until exit.
- **Pipeline pattern that worked**: codex (high reasoning, planning) → Claude dispatches 3 parallel general-purpose agents (each owning 1 file, no overlap) → Claude integrates the merge and verifies. Cuts wall time ~3x vs sequential. **Important**: tell each agent which files it OWNS and which it must NOT touch
- **Image input to codex**: convert HEIC → JPG via `sips -s format jpeg -Z 2400 file.HEIC --out /tmp/x.jpg` before passing to `codex exec -i`. The HEIC path with `-i` hung silently for 30+ min
- **Vercel env vars**: `vercel env add KEY production` then `vercel deploy --prod --yes`. **Bug we hit**: env var visible in `vercel env pull` but runtime returned undefined; couldn't crack in this session
- **Caffeinate**: `caffeinate -di -t 28800` blocks sleep for 8 h. Re-run if needed
- **Memory file**: `~/.claude/projects/-Users-georgenikabadze/memory/project_bigberlin_hackathon.md` carries the hackathon-meta context (rules, partners, prizes) across sessions — refresh AI sessions read it automatically

---

## 🎬 Loom narration script (60 s, copy-paste ready)

> "This is **Verdict** — built solo at Big Berlin Hack 2026 for the Reonic track.
>
> *(open homepage)* A homeowner enters their address. We resolve it live with Google Maps + Solar API and load the actual photoreal 3D building from Cesium tiles.
>
> *(answer 4 questions)* Bill, EV, heating, goal. That's it.
>
> *(view /quote)* Verdict computes 3 BoM options grounded in **1,277 real Reonic projects** via KNN, with live electricity tariffs from **Tavily** so the payback math is honest, and Gemini-generated objection sentences per variant.
>
> *(click Send to installer)* The lead is POSTed to our marketplace with a deterministic privacy blur — installers see the district and roof facts but not the address, name, or contact.
>
> *(open /installer)* The installer sees the lead, opens the detail. We snap the camera to the actual building via OSM polygon → Solar API bbox → fallback. The system is recomputed against the **live** roof segments on mount, not stale defaults. Per-segment table shows MPPT string allocation across each roof face.
>
> *(click Accept)* Customer details unlock. *(click Send Offer)* Homeowner gets a push toast on their phone.
>
> Three partner techs: Google Gemini, Tavily, Lovable. GitHub link in the description."

---

## 🛠 Common commands

```bash
# Local dev (kill stale + clean)
pkill -f "next dev" 2>/dev/null; rm -rf .next; pnpm dev

# Tests
pnpm test                                  # vitest, 21/21
pnpm tsc --noEmit                          # type-check

# Deploy (already authenticated)
vercel deploy --prod --yes                 # ~1 min

# Rollback if something breaks
git reset --hard pre-roof-rewrite-20260426-0243
git push --force origin main               # ⚠ only if you accept the loss

# Re-read codex research output anytime
tail -300 /tmp/verdict_research.log

# Probe APIs (dev or prod)
curl -s "http://localhost:3000/api/quote?address=Hubertusbader%20Stra%C3%9Fe%208%2C%2014193%20Berlin&bill=125&ev=true&heating=gas&goal=lower_bill" | jq '.tariff, .sizing.panelCount, .sizing.systemKwp'
curl -s "http://localhost:3000/api/roof-facts?lat=52.5358&lng=13.3835" | jq '.totalAreaM2, (.segments | length)'
```

---

## ➡ First moves for the next session

1. `cat STATUS.md` (this file)
2. `cat AGENTS.md` and `cat README.md`
3. `tail -300 /tmp/verdict_research.log` — codex's full research output (papers, APIs, agent prompts)
4. **Pick attack order**: items 1 + 4 + 6 + 2 (Lovable artifact → 30-min sunshine fix → Cesium panel overlay → Loom record)
5. Don't fight the Vercel `TAVILY_API_KEY` runtime issue — Loom on localhost works fine

**Demo loop verified working end-to-end as of 03:05 Sun**: address → quote → send → installer accept → offer → homeowner toast. Don't break it.

---

*Handoff written by Claude Code session ending at 2026-04-26 03:05 Sun. Pick up where we left off.*
