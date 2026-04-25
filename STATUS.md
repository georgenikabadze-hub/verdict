# Verdict — Session Handoff

> **For the next session (any AI window) opening this repo cold.**
> Read this first, then `AGENTS.md`, then `docs/PLAN.md`. Everything you need to continue is here.

**Last touched**: 2026-04-25 ~22:00 (Sat) · ~8h into the 24h hackathon clock · ~6h ahead of `docs/SPRINT.md` schedule

**GitHub**: github.com/georgenikabadze-hub/verdict (all work pushed)
**Localhost**: `pnpm dev` then `http://localhost:3000` (or LAN: `http://192.168.13.94:3000`)
**Vercel**: NOT updated this session per user — last prod deploy was commit `4e05431`. Local is way ahead.

---

## ✅ DONE (works on localhost right now)

### Sprints 1–4 fully shipped
- Next.js 15 + Turbopack + Tailwind 4 + Inter + dark Tesla palette
- `lib/contracts.ts` FROZEN (Intake/BoM/Variant/SizingResult/ApiStatus/LeadPacket)
- `lib/sizing/calculate.ts` — deterministic sizer, 5 golden-profile tests passing
- `lib/reonic/recommend.ts` — KNN over 1,277 Reonic projects, returns BoM + 3 cited project IDs
- `lib/api/{places,solar,gemini,timeout}.ts` — wrappers with 4s timeout + Live/Cached badge
- `lib/api/solar.ts` — `NoSolarCoverageError` distinguishes 404 from auth/quota failures
- `lib/sizing/rationale.ts` — Gemini structured-output rationale per variant
- `app/page.tsx` + `HomeShell.tsx` — two-pane layout (3D left, intake right)
- `IntakePanel.tsx` — address (with Places Autocomplete) + bill slider + EV + heating + goal
- `AddressAutocomplete.tsx` — legacy `google.maps.places.Autocomplete`, German-restricted, dark themed
- `RuhrCinematic.tsx` + `RuhrCinematicScene.tsx` — R3F intro mesh (Z-up→Y-up fixed), drag-to-orbit
- `CesiumRoofView.tsx` + `CesiumRoofViewInner.tsx` — Photoreal 3D Tiles via CesiumJS, polygon-clipped to building
- `RoofPreview.tsx` — Static Maps satellite (fallback)
- `HeatmapView.tsx` — runtime Solar dataLayers heatmap (any address with coverage, 5–15s gen + cache)
- `LayerSwitcher.tsx` — bottom-center segmented control: 3D View / Heatmap / Map
- `LiveRoofFacts.tsx` — strip showing real Solar API segments + imagery date
- `app/quote/page.tsx` — server-rendered, 3 variant cards via VariantCardStack + SpouseShareCard + SendToInstaller CTA
- `app/installer/page.tsx` + `InstallerReview.tsx` — editable BoM, Recalculate, Approve and send
- `lib/leads/store.ts` + `app/api/leads/[id]/route.ts` — process-local lead store with Approve→push notification flow
- `InstallerApprovedToast.tsx` — 2s polling on homeowner side, push card with installer logo + final BoM
- `app/api/{quote,roof-facts,heatmap,reverse-geocode,forward-geocode,leads,aerial-view}/route.ts` — all backend routes
- `scripts/copy-cesium.mjs` — postinstall copies Cesium assets to `public/cesium/`
- `scripts/bake-heatmaps.ts` — pre-bakes 5 demo heatmap PNGs at build time (kept as fallback)
- `lib/heatmaps/generate.ts` — runtime heatmap generation (extracted from bake script)
- 11 unit tests passing (5 sizer + 6 API resilience), Playwright e2e for cesium + use-my-location
- All UI in English, no `rounded-full`, all colors from token palette

### API keys + env (all in `.env.local`, gitignored)
- `GEMINI_API_KEY=AIzaSyAD...` — Workshop key, Gemini API only
- `GOOGLE_MAPS_API_KEY=AIzaSyCr...` — server-only, Solar/Static-Maps/Geocoding/Map-Tiles/Aerial-View
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyCr...` — client-side, Maps JS + Places autocomplete

### Google Cloud APIs enabled (project `bigberlin-hack26ber-3262`)
✅ Solar API · Map Tiles API · Maps JS API · Geocoding API · Places API (New) · Places API (Legacy) · Gemini · Vertex AI
❌ Aerial View API — restricted at key level + US-only per Google docs anyway (component built but unused)

---

## 🔄 PARTIAL / KNOWN ISSUES

| Area | State | Why |
|---|---|---|
| **Cesium polygon clipping** | Code shipped (`applyBuildingClip`), uses `ClippingPolygonCollection` + Solar API `boundingBox`. Visual effect is subtle — the clip works but the surrounding mesh tiles are still loaded and rendered nearby. Camera framing at 220m makes the box look small. | Could improve by darkening outside the clip, or tightening camera. Not broken, just understated. |
| **Pin / camera lock** | Just shipped (`lookAtTransform(eastNorthUpToFixedFrame(target))` + `enableTranslate=false`). Camera now orbits AROUND pin, pin stays centered. | User should test — was the immediate fix for "pin should be centered + fixed" |
| **WebGL context lost** when switching from Ruhr cinematic to Cesium | Console warning, doesn't crash | Both R3F and Cesium fight for WebGL context. Acceptable for hackathon. Real fix: tear down R3F when Cesium mounts. |
| **Aerial View API** | DEAD-END — US-only per Google docs + key blocked. `AerialVideoView.tsx` exists but unwired. | Don't waste more time on this. |

---

## 🔴 NEXT THINGS TO DO (priority order)

### 1. **Camera control polish — preset view buttons** (30 min)
Both AIs (Codex+Gemini brainstorm just landed) recommended **B) Preset view buttons** as the top homeowner UX. Implementation:
- Small toggle row (top-right of LEFT pane): **Top · Front · Side · Oblique · Roof angle**
- Each one calls `viewer.scene.camera.lookAtTransform(enu, new HeadingPitchRange(heading, pitch, range))`
- Plus a "🎯 Recenter" button (bottom-right, tooltip) that resets to the initial framing
- Codex says: **pitch is the under-used control that matters most for solar planning** — make sure "Roof angle" preset uses pitch ~-60° (top-down-ish for shading intuition)
- Anti-pattern: never expose a raw pitch slider — feels like CAD

Brainstorm output saved at `/private/tmp/claude-501/.../tasks/b8vnh5wgk.output` (fresh session can re-run via codex).

### 2. **Daytime occupancy field** (15 min)
Both AIs in earlier brainstorm (Bondio 2018 cited) said this is the single missing intake field that lifts both accuracy AND conversion. Add as 5th field in IntakePanel:
- Label: "How often are you home during the day?"
- 3 buttons: **Rarely / Sometimes / Most days**
- Wire into `lib/sizing/calculate.ts` to flip `solarDaytimeFraction` from 0.30 (default) to 0.40 (sometimes) to 0.55 (WFH/retired)
- This single value flips battery sizing entirely

### 3. **Aikido security scan** (15 min — easy 2nd partner-tech win + €1k side prize)
- Sign up at aikido.dev (free)
- Connect github.com/georgenikabadze-hub/verdict
- Click "Scan"
- Screenshot the result for the slide deck

### 4. **Tavily for live electricity tariff** (30 min — 3rd partner-tech)
- One server-side call in `/api/quote` route
- Replace hardcoded `EUR_PER_KWH_RESIDENTIAL = 0.32` with live regional tariff
- Single API call, Tavily key already in spec

### 5. **Lovable** (45 min — 4th partner-tech, OPTIONAL flex)
Re-scaffold the spouse-share card OR a brand new "first-time visit" splash via Lovable to claim the partner

### 6. **Demo lock + Vercel prod deploy** (when user says ship it)
- `vercel deploy --prod --scope georgenikabadze-4272s-projects`
- Loom recording of full happy path
- Pitch script rehearsal

---

## 🎯 PARTNER TECH STATUS (need 3 of 7)

| Partner | Status |
|---|---|
| **Google Gemini** | ✅ Live in `lib/api/gemini.ts` (variant rationale) and Gemini-3-pro-image-preview (landing mockup) |
| **Aikido** | 🔴 Not done (15 min, recommended NEXT) |
| **Tavily** | 🔴 Not done (30 min, recommended after Aikido) |
| **Lovable** | 🔴 Not done (45 min, optional) |
| **Gradium** (voice) | ❌ Not planned |
| **Pioneer / Fastino** | ❌ Rejected (1,257 too small for fine-tune) |
| **Entire** | ❌ Not architecturally aligned |

**Need to claim 2 more.** Aikido + Tavily = ~45 min total.

---

## 🧠 KEY LEARNINGS (don't repeat mistakes)

1. **Cesium clipping plane gotchas eat hours.** We tried 5 sign/normal/modelMatrix combos before pivoting to `ClippingPolygonCollection` (newer API, world ECEF directly, no plane math). Use that going forward.
2. **Aerial View API is US-only.** Per Google docs literally "physical address within the United States". Codex caught this before we wasted 30 min.
3. **Turbopack + dev server + production build conflict on `.next/`** — always `pkill next; rm -rf .next; pnpm build` in clean sequence. Don't run dev + build simultaneously.
4. **Solar API `dataLayers` returns SIGNED GeoTIFF URLs** that expire in 1 hour. We cache derived PNGs in `/tmp/verdict_heatmaps/`, NOT the URLs.
5. **Solar API `loadFixture` was returning Brandenburg Gate's data for ANY no-coverage address.** Fixed by removing the named-landmark fallback in `lib/api/solar.ts`. NEVER fallback to another building's data.
6. **Don't ask user for income/email/phone upfront** — research-backed conversion killer.
7. **Legacy Places API** (`places-backend.googleapis.com`) is separate from "Places API (New)" — both must be enabled for the legacy Autocomplete widget to work.

---

## 📁 PER-AI WORKSTREAM OWNERSHIP

See `AGENTS.md` for the full map. Quick version:
- **Claude Code**: orchestration, integration, app/, lib/api, store/, all docs
- **Codex CLI**: lib/contracts.ts, lib/sizing/, lib/reonic/, scripts/, tests
- **Gemini CLI**: components/ui, components/scene, components/cesium, animation/styling polish

---

## 🛠️ COMMON COMMANDS (copy-paste)

```bash
# Local dev (kill previous + clean .next first)
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
rm -rf .next; pnpm dev

# LAN address for sharing on same wifi
ipconfig getifaddr en0

# Tests
pnpm test                          # vitest
pnpm exec playwright test          # e2e

# Heatmap pre-bake
GOOGLE_MAPS_API_KEY=$KEY pnpm prebake:heatmaps

# Build (kill dev first!)
pkill -f "next dev"; sleep 1; rm -rf .next; pnpm build

# Probe APIs
KEY=$(grep '^GOOGLE_MAPS_API_KEY=' .env.local | cut -d= -f2)
curl -sS "http://localhost:3000/api/roof-facts?lat=52.516&lng=13.378" | jq
curl -sS "http://localhost:3000/api/heatmap?lat=52.516&lng=13.378" -o /tmp/test.png  # 5-15s

# Deploy (only when user says ship it)
vercel deploy --prod --scope georgenikabadze-4272s-projects
```

---

## 🚦 NEXT SESSION QUICK START

If you're a fresh AI session opening this repo:
1. `cat STATUS.md` (this file)
2. `cat AGENTS.md` (per-AI ownership)
3. `cat docs/PLAN.md` (full product spec)
4. `pnpm install && pnpm dev` (localhost:3000)
5. Pick the next item from "🔴 NEXT THINGS TO DO" above and ship it

User's actual priorities (in order):
1. Camera preset view buttons (top, side, oblique)
2. Aikido security scan (partner tech win)
3. Tavily integration (partner tech win)
4. Lovable component (optional 4th partner)
5. Vercel prod deploy when user says "ship it"

The **demo loop** works end-to-end: address → 3D building → 4-field intake → 3 variants → CTA → installer Recalculate → Approve → push notification on homeowner phone. Don't break any of that.
