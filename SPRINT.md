# Verdict — Sprint Execution Plan
*24h hackathon · Big Berlin Hack 2026 · Reonic track*
*Synthesized from 2 rounds of Codex + Gemini critical brainstorm. Both AIs picked the same plan on 6 of 7 axes — that's the highest-signal sprint plan we'll get.*

---

## Cadence: 6 × 4h sprints (Sat 14:00 → Sun 14:00)

Both AIs picked 4-hour gates over 6-hour blocks. The reason: in a 24h hackathon, a 6-hour silent failure is 25% of the project burned. **Every 4 hours we run a hard GO/NO-GO. Anything not at exit criteria gets cut, not extended.**

| # | Window | Goal | Exit criteria (binary — yes or no) | GO/NO-GO fallback |
|---|---|---|---|---|
| **S1** | Sat 14:00–18:00 | Skeleton + Contracts | Repo deployed to Vercel · `lib/contracts.ts` LOCKED · clickable mocked happy path renders on phone | If no deploy by 18:00 → drop live APIs from Sprint 2, push Sprint 3 to overnight |
| **S2** | Sat 18:00–22:00 | Deterministic Quote Engine | 4-field intake → sizing formulas → 3 variant cards (Best Margin / Close Rate ★ / LTV) populated from Reonic fixture KNN · installer can edit BoM and **Recalculate** updates variant numbers live · all math visible in `/debug` panel | If sizing formulas drift outside ±10% on the 5 golden test profiles by 22:00 → freeze to hand-curated fixture variants for those 5 profiles |
| **S3** | Sat 22:00–Sun 02:00 | Cinematic + Live Maps | Ruhr.glb cinematic loads in <3s on phone · Places autocomplete works · Solar API `buildingInsights` returns roof segments for typed urban German addresses · every Maps call wrapped in 4s timeout + Live/Cached badge | If 3D Tiles latency >4s average → hide 3D Tiles, lock to Ruhr.glb cinematic + 4 pre-warmed safety addresses on cached Solar fixtures |
| **S4** | Sun 02:00–06:00 | Gemini rationale + push notification | Gemini structured JSON returns variant SKU + 3 cited project IDs + 1 objection-prediction per variant · falls back to deterministic template after 1 retry · installer "Approve and send" flips a Vercel KV (or in-memory) flag · homeowner phone polls every 2s and shows in-app push notification with installer logo + final BoM | If Gemini schema fails twice → use deterministic template copy (3 hand-written rationales keyed by variant) |
| **S5** | Sun 06:00–10:00 | Demo lock | NO new features. Phone-test the 5 golden profiles end-to-end. Cached fallback toggle visible. Backup video recorded with screen recording tool. Pitch script rehearsed twice on the actual device. | If anything is flaky after 2 dress rehearsals → remove it from the demo path |
| **S6** | Sun 10:00–14:00 | Submit | Final Vercel URL frozen. Loom recorded. Submission packet posted by 14:00 on the dot. Slide deck reviewed. | Any code change after 12:00 must be approved by Integration Lead (no exceptions) |

### The single highest-leverage hour: **Sat 17:00–18:00 — contract freeze**
Both AIs flagged this. If `lib/contracts.ts` (Intake, SizingResult, Variant, BoM, ApiStatus) is not locked by 18:00, every workstream invents its own interface and Sunday becomes glue hell. **Whoever is integration captain has veto power on contract changes after 18:00 — full stop.**

---

## Workstreams (4 people, 4 streams — Integration is shared)

| Stream | Owner profile | Owns | Depends on | Do NOT touch |
|---|---|---|---|---|
| **Experience / Integration Lead** | Strong frontend, opinionated about UX, owns Vercel + QA + demo script | `app/`, `components/homeowner/`, `components/installer/`, Vercel config, the demo script, the dress rehearsals | All other streams (consumer of contracts) | Sizing math, KNN logic, API client internals |
| **3D & Maps Lead** | Comfortable with three.js / WebGL / GIS | `components/scene/` (R3F + DRACOLoader), `components/cesium/` (lazy-loaded), `lib/maps/places.ts`, public `.glb` assets | App shell from Experience Lead | Business logic, installer flow, Gemini |
| **Sizing & Data Lead** | Backend / data engineering bias, comfortable with CSVs | `lib/sizing/calculate.ts`, `lib/reonic/fixtures.ts`, CSV-to-JSON conversion script, `data/fixtures/`, golden-profile test runner | CSVs only (zero UI deps) | UI styling, 3D, route handlers |
| **LLM & API Lead** | Opinionated about prompts + API resilience | `lib/gemini/client.ts`, `lib/api-status/badge.ts`, all timeouts, schema validation, fallback templates, `app/api/quote/route.ts` orchestrator | Sizing output schema | 3D, mesh geometry, UI animation |

**Integration captain rotation**: the Experience Lead is integration captain by default. They get veto on `lib/contracts.ts` after Sat 18:00, own every Vercel deploy, and run the dress rehearsals. During heavy build hours they are still shipping features in the homeowner UI.

---

## Tech stack — final, opinionated

| Layer | Pick | Why (1 line) |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Vercel-native, server components for the orchestrator route, fastest path to deploy |
| 3D — cinematic | **react-three-fiber + drei + DRACOLoader** | Owns the Ruhr.glb intro. Camera, lights, panel-snap animations. |
| 3D — live "any address" | **CesiumJS (lazy-loaded)** | Photorealistic 3D Tiles. Lazy-loaded route, separate canvas, never imported on hero page. |
| State | **Zustand + `persist` middleware** | Persist middleware is non-negotiable — see pre-mortem #4 below. |
| UI | **shadcn/ui + Tailwind** | Tesla-precision dark aesthetic; no design system to fight. |
| Forms | **React Hook Form + Zod** | Schemas reused as Gemini structured-output validators. |
| Animation | **motion (framer-motion)** | Layout transitions, panel snap, variant card stamp-in. |
| Data fetching | **TanStack Query** | Built-in retry + cache + 4s timeout fits the Live/Cached badge pattern. Direct fixture imports for KNN data. |
| Places autocomplete | **Google Places JS API directly** (no `use-places-autocomplete` wrapper) | One less dependency, full control over the dropdown styling. |
| Image / heatmap | **Sharp** in a Saturday-night script to bake Solar API GeoTIFFs → PNG overlays | Loaded as Three.js textures at runtime, not live shaders. |
| LLM access | **Raw `fetch` to Gemini REST** (NOT the Google AI SDK) | Codex + Gemini both picked this. Fewer dep surprises, easier failure handling, 24h-friendly. |
| Deploy | **Vercel** | First deploy by Sat 18:00. Re-deploy on every commit to `main`. |
| Local dev | **pnpm + Node 22 LTS** | Both AIs explicitly rejected Bun — too risky for a 4-person hackathon team. |

---

## The 5 most critical files (Sprint 1, in order)

1. **`lib/contracts.ts`** — All shared types: `Intake`, `SizingResult`, `Variant`, `BoM`, `ApiStatus`, `LeadPacket`. **FROZEN at Sat 18:00.** Every workstream codes against this.
2. **`lib/sizing/calculate.ts`** — Pure functions: `sizePanels()`, `sizeBattery()`, `sizeHeatPump()`, `validateAgainstHardRules()` (inverter ratio + 70% feed-in + roof fit). Tested against the 5 golden profiles.
3. **`lib/reonic/fixtures.ts`** — `loadProjects()` + `loadLineItems()` + `recommendBom(sizing, strategy)` (KNN with weighted overlap on non-null fields + Jaccard over line-item tokens).
4. **`app/page.tsx`** — Complete mocked homeowner happy path: address input → 3D placeholder → 4-field intake → 3 variant cards → CTA → confirmation. Wired to Zustand. No live APIs in Sprint 1 — just the navigation skeleton.
5. **`components/installer/InstallerReview.tsx`** — Installer-in-the-loop screen with editable BoM rows + **Recalculate** button + **Approve and send** action. Calls deterministic sizer, NOT LLM. This is the proof artifact — both AIs flagged this as the demo's weak link if faked.

---

## Multi-agent execution: Claude spawns 5 parallel sub-agents in Sprint 1

The user's main Claude session orchestrates. Each sub-agent is spawned in the **first hour** of Sprint 1 to scaffold in parallel. Each agent has a strict file-ownership contract — no overlap, no merge conflicts.

| Agent | Spawned at | Files it writes | Interface contract | When done |
|---|---|---|---|---|
| **Contracts Agent** | T+0:00 | `lib/contracts.ts`, `data/schema.ts` | Pure TypeScript types + Zod schemas. No imports from other workstreams. Output reviewed and FROZEN by T+4h. | T+1:30 |
| **Sizer Agent** | T+0:30 (after Contracts emits draft) | `lib/sizing/calculate.ts`, `lib/sizing/__tests__/golden_profiles.test.ts` | Input: `Intake` → Output: `SizingResult`. Pure functions. Zero side effects. | T+3:00 |
| **Reonic Agent** | T+0:30 | `scripts/csv_to_json.ts`, `lib/reonic/fixtures.ts`, `data/fixtures/projects.json`, `data/fixtures/line_items.json` | Output: `recommendBom(sizing: SizingResult, strategy: "margin"|"closeRate"|"ltv"): BoM`. Strategy-keyed, deterministic. | T+3:30 |
| **UI Flow Agent** | T+0:30 | `app/page.tsx`, `app/installer/page.tsx`, `components/homeowner/*`, `components/installer/InstallerReview.tsx`, `store/appStore.ts` | Consumes contracts only. All API calls go through stubs that return fixture data initially. | T+4:00 |
| **API Resilience Agent** | T+1:00 | `lib/api/places.ts`, `lib/api/solar.ts`, `lib/api/tiles.ts`, `lib/api/gemini.ts`, `lib/api-status/badge.ts` | Every wrapper returns `{data, source: "live"|"cached", latencyMs}`. 4-second timeout. Cached fallback per address. | T+4:00 |

**Why these 5 agents and not Gemini's 4** (UI Scaffolder / Data Mocker / State Builder / API Stubber): Gemini's split causes 3 agents to write into `app/` and `store/` simultaneously — guaranteed merge conflict before contracts are stable. Codex's split maps to **real seams** (contracts / math / data / UI / API) so each agent writes to a different directory tree.

---

## Pre-mortem additions (round 2 caught two new ones)

Beyond what's already in PLAN.md §7:

1. **(Gemini caught this)** Phone session resets mid-demo. *Mitigation*: Zustand `persist` middleware on `localStorage`. If the judge locks the screen or refreshes, the app reopens to the same step. **30-minute job, do it in Sprint 1.**
2. **(Codex caught this)** Demo looks slick but fails the "why Reonic wins" question. *Mitigation*: every variant card must visibly cite at least 3 Reonic project IDs and 1 objection-prediction. The "Recalculate" button must change visible margin/payback numbers — not silently. The handoff packet must show roof measurements + cited projects + recommended BoM. If a judge can't see Reonic's data driving the recommendation, the demo is theater.
3. Cesium bundle breaks mobile. *Mitigation*: `dynamic(() => import('...'), { ssr: false })`. Cesium only loads on the "type any address" route. Hero page bundle stays small.
4. Next.js 15 caches API routes too aggressively. *Mitigation*: `export const dynamic = 'force-dynamic'` on every `/api/*` route.
5. CSV columns have unit bugs (we know `inverter_power_kw` stores Watts). *Mitigation*: pre-process CSVs to clean JSON fixtures via the Reonic Agent's script BEFORE Sprint 2 starts. Sanity-check 30 rows by eye.
6. Merge hell at Sat 22:00 integration. *Mitigation*: strict directory ownership above. Contracts frozen at 18:00. Anyone needing to change contracts after that goes through the Integration Lead.

---

## Hard timeline gates (rephrased)

- **Sat 18:00** — Contracts locked. Vercel deploy live. Mocked happy path clickable on phone.
- **Sat 22:00** — **Deterministic quote flow + installer edit/recalculate works without live APIs.** This is the spine. If this slips, Sunday is product-discovery hell, not polish.
- **Sun 06:00** — Live APIs wired (Places + Solar + Gemini). Live/Cached badges everywhere. Push notification works. **Feature freeze starts.**
- **Sun 10:00** — Dress rehearsal #1 + backup video recorded.
- **Sun 12:00** — Dress rehearsal #2 (live, on the actual demo phone).
- **Sun 14:00** — Submit.

---

## Testing strategy — regression + smoke

**Two layers, both gated into the sprint exits.** Tests are not optional polish; they are the only thing that catches a sizing-formula drift or a broken happy-path before Sun 14:00.

### Layer 1 — Unit / regression (Vitest)

Run on every commit via a pre-push hook + GitHub Actions (free for public repo).

| Suite | Files | Owner | Sprint | Pass bar |
|---|---|---|---|---|
| **Golden profiles** | `lib/sizing/__tests__/golden_profiles.test.ts` | Sizing & Data Lead | S2 | All 5 profiles produce expected panel count ±10% (Berlin family of 4 → 14 panels, Munich couple+EV → 22 panels, etc.). **S2 cannot exit until this passes.** |
| **Hard validation rules** | `lib/sizing/__tests__/hard_rules.test.ts` | Sizing & Data Lead | S2 | German 70% feed-in cap rejects violating variants. Inverter ratio cap (0.75–1.10). Roof area fit. Each rule has a passing + failing fixture. |
| **KNN recommender** | `lib/reonic/__tests__/recommend.test.ts` | Sizing & Data Lead | S2 | For each of the 5 profiles, the recommended BoM cites at least 3 distinct Reonic project IDs. Strategy keys (`margin` / `closeRate` / `ltv`) return different BoMs. |
| **API resilience wrappers** | `lib/api/__tests__/resilience.test.ts` | LLM & API Lead | S3 | Mock Solar API to delay 5s → wrapper returns `{source: "cached", ...}` from fixture. Mock Solar 500 → falls back. Mock Solar 200 in <4s → returns `{source: "live", ...}`. |
| **Gemini schema validation** | `lib/gemini/__tests__/schema.test.ts` | LLM & API Lead | S4 | Mock Gemini returning malformed JSON → wrapper returns deterministic template. Mock valid JSON → schema-validates the rationale + 3 cited project IDs. |

### Layer 2 — End-to-end smoke (Playwright)

Run after every Vercel deploy. **5 scenarios, mobile viewport (iPhone 14 Pro emulated).** Total runtime <2 minutes.

| Scenario | Sprint added | Steps | Pass bar |
|---|---|---|---|
| **Homeowner happy path — Ruhr cinematic** | S1 (smoke skeleton) → S3 (real) | Open `/` → autocomplete address → wait for cinematic → fill 4 fields → see 3 variant cards → tap recommended → see "Why this wins" → tap CTA → see confirmation | All steps complete in <30s. No console errors. Variant card shows €/month + payback timeline. |
| **Homeowner happy path — live "any address"** | S3 | Open `/` → type "Reichstag Berlin" → confirm autocomplete → cinematic via 3D Tiles → 4 fields → variants → CTA → confirmation | Live/Cached badge shows 🟢 Live. Same end state as scenario 1. |
| **Installer review + Recalculate + Approve** | S2 (skeleton) → S4 (real) | Open `/installer` → click incoming lead card → see same 3D house homeowner saw → swap battery brand → tap Recalculate → variant numbers re-flow → tap Approve | Numbers visibly change after Recalculate (margin, payback, monthly savings). Approve action triggers state flip. |
| **Second-touch push notification** | S4 | Two browser contexts: tablet (installer) and phone (homeowner). Approve in tablet → within 3 seconds, phone shows notification card with installer logo + final BoM | Polling latency <3s. Final BoM shows the swapped component. |
| **Live → Cached fallback** | S3 | Mock Solar API to return 500 → open `/` → autocomplete → cinematic → wait for fallback → see 🟡 Cached badge | Demo flow continues to completion without hanging. Badge is visible, not silent. |

### Sprint test gates

- **S1 exit**: 1 Playwright smoke test (homeowner happy path) running against the deployed Vercel URL. CI passing.
- **S2 exit**: All 5 golden profiles + hard rules + KNN recommender unit tests passing. Smoke test for installer Recalculate + Approve passing.
- **S3 exit**: Smoke tests for live "any address" + Live→Cached fallback passing. Solar wrapper resilience tests passing.
- **S4 exit**: Smoke test for second-touch push notification passing. Gemini schema test passing. **Full smoke suite green.**
- **S5 entry**: All 5 smoke scenarios green AND manual phone-QA checklist signed off by Integration Lead.

### Manual phone-QA checklist (run in S5 dress rehearsal)

Tape this to the wall. Every item must be checked off before Sun 10:00 ends.

- [ ] Hero loads in <2s on cellular (not wifi) on the actual demo phone
- [ ] Address autocomplete dropdown is tappable with thumb (not just click-able with mouse)
- [ ] 3D fly-in animation is smooth at >30fps (verify with Chrome DevTools Performance Monitor)
- [ ] All 4 intake fields auto-focus next on Enter / chip-tap
- [ ] Sticky bottom CTA is visible above the iOS Safari address bar
- [ ] Variant cards swipe horizontally with momentum on mobile
- [ ] Recalculate button on installer view spins for ≤2s, then numbers update
- [ ] Push notification on homeowner phone shows within 3s of installer Approve
- [ ] Backup video plays full 90s without pausing
- [ ] Vercel URL works in incognito, on a fresh device, with no cookies
- [ ] If wifi drops mid-demo, Live/Cached badge flips honestly
- [ ] Spouse-share card screenshot looks shareable (no scrollbars, no debug overlays)

### Tooling

```bash
# Sprint 1 setup (Experience Lead during the first hour)
pnpm add -D vitest @vitejs/plugin-react happy-dom
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

`vitest.config.ts` with `happy-dom` for unit tests. `playwright.config.ts` with mobile viewport (iPhone 14 Pro device descriptor) + `baseURL` set to the Vercel preview URL injected from CI.

GitHub Actions workflow (`.github/workflows/ci.yml`) runs Vitest on every push. Playwright runs on Vercel preview-ready webhook (or manual `pnpm test:e2e` against the latest deploy).

### What we are NOT testing

- Cross-browser (Chrome only — that's the demo browser)
- Accessibility (out of scope for 24h)
- Internationalization (English only)
- Performance budgets (smoke tests only check it works, not how fast)

---

## What we are NOT doing (anti-scope)

- ❌ No real Firebase/Supabase auth — the demo has zero user accounts
- ❌ No real push notifications (FCM/OneSignal) — Vercel KV + 2s polling
- ❌ No backend database — JSON fixtures all the way down
- ❌ No internationalization — English only (already locked in PLAN.md)
- ❌ No PWA install / service worker — too much config for too little demo lift
- ❌ No PDF generation — Stage 4 polish only, ship if Sprint 5 has slack
- ❌ No mesh-clustering geometry — Solar API gives us roof segments natively (DROPPED in PLAN.md pivot)
- ❌ No `use-places-autocomplete` wrapper — Google Places JS API directly
- ❌ No Bun — pnpm + Node 22 only

---

*Built in 24h. Spine = deterministic quote credibility. 3D and AI are presentation layers on top of math that works.*
