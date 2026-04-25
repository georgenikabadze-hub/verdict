# Verdict — Bootstrap Protocol

**Read this file first if you are a fresh AI session opening this repo cold.** Then read `STATUS.md` to see where the build is right now. Then read `PLAN.md` for the product spec and `SPRINT.md` for the sprint cadence.

The team uses **three AI coding assistants in parallel** to ship a 24h hackathon project. This file defines who owns what, how we coordinate, and the exact commands to take an empty laptop to a deployed Vercel preview.

---

## 1. AI workstream ownership (zero overlap)

**Rule: each AI owns specific directories. No AI edits another's files without writing the path into `LOCKS.md`.** Trunk-based on `main`, `git pull --rebase` before every commit, conventional commit messages.

| Assistant | Strengths leveraged | Owns these paths exclusively |
|---|---|---|
| **Claude Code** (orchestration / integration / review) | Long-context reasoning, refactoring across files, integration glue, code review | `app/layout.tsx`, `app/page.tsx`, `app/installer/page.tsx`, `app/api/**`, `lib/api/**`, `lib/api-status/**`, `store/**`, `BOOTSTRAP.md`, `SPRINT.md`, `PLAN.md`, `STATUS.md`, `LOCKS.md`, all git/deploy commands, every PR review |
| **Codex CLI** (deterministic engine / math / data) | Backend logic, algorithms, structured outputs, terminal-native workflow | `lib/contracts.ts`, `data/schema.ts`, `lib/sizing/**`, `lib/reonic/**`, `scripts/**`, `data/fixtures/**`, all unit tests under `__tests__` |
| **Gemini CLI** (UI / 3D / design polish) | Visual implementation, multimodal design reasoning, animation polish | `components/ui/**` (shadcn primitives), `components/scene/**` (R3F + Ruhr.glb), `components/cesium/**` (3D Tiles lazy), `components/homeowner/**` skinning, `components/installer/**` skinning, `app/globals.css`, Tailwind config |
| **Lovable** (one-shot UI scaffold at H+0) | Fast wireframe-to-React | First version of `components/homeowner/IntakeBottomSheet.tsx`, `components/homeowner/VariantCardStack.tsx`. Output is dumped into the repo and Gemini takes ownership immediately after. |

### Coordination rules

1. **Before editing**: pull `main`, run `git status`, check `LOCKS.md` for in-flight edits in your target paths.
2. **While editing a file outside your owned paths**: append a line to `LOCKS.md` — `<path> | <ai-name> | <ISO timestamp> | <brief purpose>`. Remove the line when you commit and push.
3. **Contract changes after Sat 18:00**: only Claude can edit `lib/contracts.ts`. Codex/Gemini propose changes via a comment in the commit message, Claude reviews and applies.
4. **Every commit**: conventional commit format. Examples: `feat(sizer): panel count formula`, `fix(installer): recalculate triggers schema validation`, `chore: bump shadcn`.
5. **Every push**: triggers a Vercel preview deploy automatically (after first link).
6. **End of every session**: write `STATUS.md` with `NEXT: <task name> by <ai>` so the next session opens cold without re-discovery.

---

## 2. Bootstrap commands (run at Sat 14:00, Hour 0)

```bash
# 1. Clone the repo
git clone https://github.com/georgenikabadze-hub/verdict.git
cd verdict

# 2. Node + pnpm versions (locked)
nvm install 22 && nvm use 22
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 3. Initialize Next.js 15 in the existing repo (preserves PLAN.md / SPRINT.md / .env.local)
pnpm create next-app@15 ./_scaffold --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm
# Move scaffold contents up one directory, delete the temp folder
rsync -av --exclude='.git' --exclude='*.md' _scaffold/ ./
rm -rf _scaffold

# 4. Production deps
pnpm add zustand @tanstack/react-query react-hook-form @hookform/resolvers zod
pnpm add motion three @react-three/fiber @react-three/drei
pnpm add lucide-react clsx tailwind-merge class-variance-authority

# 5. Dev deps + testing
pnpm add -D vitest @vitejs/plugin-react happy-dom @testing-library/react
pnpm add -D @playwright/test
pnpm exec playwright install chromium

# 6. shadcn/ui
pnpm dlx shadcn@latest init -d

# 7. Copy env vars (already in .env.local, gitignored)
cp .env.example .env.local 2>/dev/null || true

# 8. First boot — confirm it runs
pnpm dev
# Visit http://localhost:3000 — Next.js default page should render. Kill with Ctrl+C.

# 9. Vercel link + first deploy
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link --project verdict --yes
pnpm dlx vercel@latest env add GEMINI_API_KEY production
pnpm dlx vercel@latest env add GOOGLE_MAPS_API_KEY production
pnpm dlx vercel@latest env add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY production
pnpm dlx vercel@latest deploy
pnpm dlx vercel@latest deploy --prod

# 10. Commit and push the scaffold
git add .
git commit -m "chore: next.js 15 scaffold + shadcn + r3f + cesium dependencies"
git push
```

After step 9, the URL `verdict-<hash>.vercel.app` is live. Subsequent pushes auto-deploy preview URLs; promotion to prod happens manually with `vercel deploy --prod` at Sun 13:30.

**Cesium-specific setup**: Cesium ships large WebGL assets. After `pnpm add cesium`, the `next.config.mjs` needs:
```js
import CopyWebpackPlugin from 'copy-webpack-plugin';
// ... in webpack config: copy node_modules/cesium/Build/Cesium to public/cesium
```
This is the Cesium Lead's first task in S3 (Sat 22:00). Don't try to do it in S1.

---

## 3. The contract freeze — `lib/contracts.ts` (Codex writes at H+1, frozen at H+4)

This is the single most important file in the repo. **Frozen at Sat 18:00** — after that, only Claude can change it, and only with the team's explicit sign-off.

```ts
// lib/contracts.ts
// FROZEN AT SAT 18:00. No changes without integration captain approval.

export type Heating = "gas" | "oil" | "district" | "heat_pump" | "electric";
export type Goal = "lower_bill" | "independence";
export type Strategy = "margin" | "closeRate" | "ltv";

export interface Intake {
  address: string;
  lat: number;
  lng: number;
  monthlyBillEur: number;
  annualKwh?: number;       // derived from bill if not provided
  ev: boolean;
  heating: Heating;
  goal: Goal;
}

export interface BoM {
  panels: { brand: string; model: string; count: number; wp: number };
  inverter: { brand: string; model: string; kw: number };
  battery?: { brand: string; model: string; kwh: number };
  wallbox?: { brand: string; model: string; kw: number };
  heatPump?: { brand: string; model: string; kw: number };
  totalEur: number;
}

export interface Variant {
  id: string;
  label: "Best Margin" | "Best Close Rate" | "Best LTV";
  strategy: Strategy;
  bom: BoM;
  monthlySavingsEur: number;
  paybackYears: number;
  marginPct: number;
  winRatePct: number;
  confidence: number;       // 0..1
  citedProjectIds: string[]; // exactly 3 Reonic project IDs
  objection: string;        // "Risk: ..." sentence
}

export interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  areaMeters2: number;
  annualSunshineHours: number;
}

export interface SizingResult {
  annualKwh: number;
  dailyKwh: number;
  usableRoofAreaM2: number;
  roofSegments: RoofSegment[];
  panelCount: number;
  systemKwp: number;
  batteryKwh: number;
  heatPumpKw?: number;
  annualYieldKwh: number;
  rules: { name: string; pass: boolean; message: string }[];
  variants: [Variant, Variant, Variant];   // exactly 3, in order: margin, closeRate (recommended), ltv
}

export interface ApiStatus {
  source: "live" | "cached" | "mock";
  status: "ok" | "timeout" | "error";
  latencyMs: number;
  message?: string;
}

export interface LeadPacket {
  id: string;
  createdAt: string;       // ISO
  intake: Intake;
  sizing: SizingResult;
  selectedVariantId: string;
  installerStatus: "new" | "reviewed" | "approved";
  finalVariant?: Variant;  // populated after installer approves
  shareUrl: string;
}
```

Matching Zod schemas live in `data/schema.ts` (also Codex-owned).

---

## 4. Per-hour Sprint 1 breakdown (Sat 14:00–18:00)

Each hour ends with a binary check. If the check fails, you do not move to the next hour — you fix the failure or invoke the GO/NO-GO fallback in `SPRINT.md`.

### Hour 0 (14:00–15:00) — Scaffold & deploy
- **Driver**: Claude Code
- **Files at start**: `PLAN.md`, `SPRINT.md`, `BOOTSTRAP.md`, `README.md`, `LICENSE`, `.env.example`, `.env.local`, `.gitignore`, `landing-mockup.png`
- **Files at end**: full Next.js 15 app, `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx` (Next.js default), `next.config.mjs`, deployed Vercel URL
- **Check**: `pnpm dev` boots, Vercel preview URL renders the Next.js default page on a phone
- **Parallel**: Lovable prompt fired (see §6). Output saved to `_lovable_drop/` for Gemini to absorb in H+1.

### Hour 1 (15:00–16:00) — Contracts & UI primitives
- **Driver**: Codex (contracts) + Gemini (UI primitives)
- **Codex prompt**: "Read `BOOTSTRAP.md` §3. Write `lib/contracts.ts` with all the types in §3 verbatim, plus matching Zod schemas in `data/schema.ts`. Do not import React or any UI library. Done when `pnpm tsc --noEmit` passes."
- **Gemini prompt**: "Read `_lovable_drop/`. Migrate the components into `components/ui/*` (shadcn primitives) and `components/homeowner/*` (route-specific). Use the color tokens in §6. Do not edit `app/page.tsx` or `lib/*`. Done when `pnpm dev` shows the homeowner shell on `/_preview`."
- **Files at end**: `lib/contracts.ts` ✓ frozen draft, `data/schema.ts` ✓, `components/ui/*` populated, `components/homeowner/IntakeBottomSheet.tsx` and `VariantCardStack.tsx` rendering with mock props
- **Check**: `pnpm tsc --noEmit` passes AND `/_preview` route shows the bottom sheet on mobile viewport

### Hour 2 (16:00–17:00) — Engine + KNN + UI flow
- **Drivers**: Codex (sizer + Reonic), Claude (UI flow + Zustand store)
- **Codex Sizer prompt**: "Read `lib/contracts.ts`. Implement `lib/sizing/calculate.ts` exporting `sizeQuote(intake: Intake, roofSegments: RoofSegment[]): SizingResult`. Use the formulas in `PLAN.md` §4d-prefix. Apply hard validation rules. Return exactly 3 variants in order [margin, closeRate, ltv]. Done when `pnpm vitest lib/sizing` passes all 5 golden profiles ±10%."
- **Codex Reonic prompt**: "Read `lib/contracts.ts`. Implement `scripts/csv_to_json.ts` (one-time conversion of `data/raw/*.csv` to `data/fixtures/projects.json` + `line_items.json`). Then `lib/reonic/recommend.ts` exporting `recommendBom(sizing: SizingResult, strategy: Strategy): BoM` using KNN with weighted overlap on non-null fields + Jaccard over line-item tokens. Each call cites exactly 3 project IDs. Done when `pnpm vitest lib/reonic` passes."
- **Claude UI Flow prompt**: "Wire `store/appStore.ts` (Zustand + persist middleware on localStorage). Wire `app/page.tsx` to call sizer → reonic → display 3 variants. All API calls stubbed to return fixtures for now. No live Maps yet. Done when filling out the 4-field form shows 3 populated variant cards."
- **Files at end**: `lib/sizing/calculate.ts`, `lib/reonic/recommend.ts`, `data/fixtures/*.json`, `store/appStore.ts`, working mocked happy path
- **Check**: `pnpm vitest` green AND filling out the form on `/` shows 3 variant cards with non-fake numbers

### Hour 3 (17:00–18:00) — Installer view + contract LOCK
- **Drivers**: Claude (installer view), Gemini (mobile polish), Codex (test coverage)
- **Claude Installer prompt**: "Build `app/installer/page.tsx` + `components/installer/InstallerReview.tsx`. Show the lead inbox card (mock 1 lead from the homeowner Zustand store). On click, show editable BoM rows + Recalculate button (calls `sizeQuote` again with edited BoM) + Approve and send button (mutates `installerStatus` to 'approved'). Done when on `/installer` you can edit a battery brand, hit Recalculate, and see the variant numbers update."
- **Gemini Polish prompt**: "Pass over `app/page.tsx` and homeowner components for Tesla-precision aesthetic: spacing, typography, the neon-blue (#3DAEFF) accent on focus rings + recommended-variant ★, smooth transitions on field changes. Do not edit any `lib/` file."
- **Codex Tests prompt**: "Write `lib/sizing/__tests__/hard_rules.test.ts` covering the 70% feed-in cap + inverter ratio + roof fit. Write `lib/reonic/__tests__/recommend.test.ts` covering the 5 golden profiles + cited-IDs invariant."
- **CONTRACT FREEZE at 17:55**: Claude reads `lib/contracts.ts`, runs `git tag contracts-v1`, posts the type signatures into the team chat. After this, contract changes require Claude approval.
- **Files at end**: `/installer` works end-to-end, all tests passing
- **Check**: Recalculate visibly changes margin and payback numbers, AND `pnpm vitest` is green, AND `lib/contracts.ts` is tagged `contracts-v1`

---

## 5. Per-hour breakdown for Sprints 2–6 (condensed)

| Sprint | Hour | Driver(s) | Output | Check |
|---|---|---|---|---|
| **S2** Sat 18:00 | H+4 | Codex | Sizer formulas pass all 5 golden profiles ±10% | `pnpm vitest lib/sizing` green |
| | H+5 | Codex + Claude | KNN tuned, BoM citations real | All variants cite 3 distinct Reonic project IDs |
| | H+6 | Claude | Installer Recalculate triggers full sizer re-run + visible variant delta | E2E click test passes |
| | H+7 | Gemini | Loading/empty/error states polished | No "undefined" or empty placeholders visible |
| **S3** Sat 22:00 | H+8 | Gemini (3D) | Ruhr.glb cinematic loads in <3s on phone, DRACO normalized | FPS >30 on Pixel 7 emulator |
| | H+9 | Claude | Places autocomplete wired with 4s timeout + Live/Cached badge | Typing "Reichstag" picks the building |
| | H+10 | Claude | Solar API client returns roof segments for typed addresses | Live Roof Facts strip populates with real data |
| | H+11 | Gemini (Cesium) | 3D Tiles lazy-loaded only on `/explore` route, isolated WebGL context | Hero page bundle stays <300KB JS |
| **S4** Sun 02:00 | H+12 | Claude | Gemini REST client with structured-output schema validation | One Gemini call returns valid `Variant[]` |
| | H+13 | Claude | Vercel KV polling for installer-approval flag | Tablet click → phone notification in <3s |
| | H+14 | Gemini | Spouse-share card layout final | Screenshot looks shareable, no debug overlay |
| | H+15 | Codex | Resilience tests for Solar/Tiles/Gemini | Timeout test, 500-error test, malformed-JSON test all green |
| **S5** Sun 06:00 | H+16 → H+19 | All hands | Demo lock, dress rehearsal, backup video | 5 smoke tests green on phone |
| **S6** Sun 10:00 | H+20 → H+23 | Claude | Final rehearsal, Loom recording, submit | Submission posted by 14:00 |

---

## 6. Lovable / v0 design prompt (paste into one input)

> Build a Next.js + Tailwind + shadcn React UI for **Verdict**, a premium AI solar quote tool for German homeowners. Aesthetic: **Tesla precision meets German banking trust** — references: tesla.com/de_DE/model3/design, linear.app, vercel.com.
>
> Color palette: background `#0A0E1A` near-black, surface `#12161C`, border `#2A3038`, foreground `#F7F8FA`, muted `#9BA3AF`, primary accent `#3DAEFF` (neon blue), success `#62E6A7`, warning `#F2B84B`. Typography: Inter (variable), tight tracking. Mobile-first. No gradients, no glassmorphism, no marketing hero with video.
>
> Build these screens:
>
> **Screen 1 — Landing** (mobile, full bleed). Top: tiny "Verdict" wordmark. Center hero copy: "Your home can earn more than you're losing on energy." Subcopy small grey: "Based on 1,277 real Reonic projects". One large dark-glass address input field with placeholder "Enter your address...". Below input: small link "Use my location". Behind everything: a faint slowly-rotating 3D house silhouette as a background animation.
>
> **Screen 2 — Reveal + intake**. Top half: 3D viewport of the user's house (cached drone mesh placeholder). Bottom half: bottom sheet with 4 inputs in this order:
> 1. Monthly electricity bill — slider, default €120
> 2. Electric vehicle — Yes/No segmented control
> 3. Heating system — segmented control: Gas / Oil / Heat pump / District
> 4. Goal — segmented control: Lower bill / Become independent
>
> Above the sheet, a small "Live roof facts" chip: "2 roof faces · 26.6 m² · 7° pitch · imagery Jul 2022 · 🟢 Live".
>
> **Screen 3 — Variants**. Three cards stacked vertically (mobile) with the recommended ★ middle one expanded:
> - Best Margin (collapsed)
> - **Best Close Rate ★ Recommended** (expanded, neon-blue accent border)
> - Best Lifetime Value (collapsed)
>
> Recommended card content top-to-bottom: tiny uppercase "BEST CLOSE RATE ★" badge, big number "You save approx. €142 / month" (32px), horizontal payback timeline (Year 0 invest → Year 8 break-even → €38,400 over 25 years), component summary row "🟢 PV · 🟢 Storage · 🟡 Heat pump", three one-line trust bullets, an expandable "Why this recommendation?" drawer, full-width primary CTA "Send to a certified Reonic installer".
>
> **Screen 4 — Confirmation**. "Verdict sent · Müller Solartechnik is reviewing your proposal. We'll notify you within 24 hours." Optional: "Download Verdict packet as PDF" link.
>
> **Screen 5 — Installer review** (tablet viewport). Left half: same 3D house. Right half: editable BoM table (Panels / Inverter / Battery / Mount), each row with a pencil icon. Below: cited project IDs. Below: "Recalculate" button + "✓ Approve and send" primary CTA.
>
> **Screen 6 — Installer approval push** (mobile, returning to homeowner). Top notification card: "🔔 Your Verdict has been finalized" + installer logo + final system summary + "Open final proposal →" link.
>
> **Negative constraints** — never do these:
> - No purple gradients, no rainbow accents, no animated blobs, no playful illustrations
> - No "buy now / deposit / sign up" CTAs anywhere
> - No fake auth screens
> - No long marketing paragraphs
> - No emojis other than the traffic-light dots (🟢🟡🔴) and the bell (🔔)
> - No nested cards
> - No rounded buttons (use 8px radius max)
> - No dropshadows
>
> Output: separate .tsx files per screen using shadcn/ui primitives. Use Tailwind utility classes. Components should accept all data as props (no hardcoded API calls).

---

## 7. Sub-agent prompts (ready to fire into any AI)

### Contracts Agent (Codex)
```
You are the Contracts Agent for Verdict.

Read /BOOTSTRAP.md section 3. Write the file lib/contracts.ts with the EXACT type signatures in that section (verbatim, no additions). Then write data/schema.ts with matching Zod schemas (one schema per type).

Constraints:
- No imports from React, three.js, any UI library, or any other lib/ file
- Use only `zod` as a dependency
- Export every type and schema as a named export
- Add JSDoc only on Variant.objection and SizingResult.rules

Done when:
- pnpm tsc --noEmit passes with zero errors
- pnpm vitest data/schema runs zero tests but exits 0
- A test file at data/__tests__/schema.test.ts confirms each Zod schema parses a valid example fixture
```

### Sizer Agent (Codex)
```
You are the Sizer Agent for Verdict.

Read lib/contracts.ts. Implement lib/sizing/calculate.ts:
- export function sizeQuote(intake: Intake, roofSegments: RoofSegment[]): SizingResult
- Use formulas from PLAN.md §4d-prefix (Panel = kWh ÷ (PSH × 365 × Wp × 0.001 × 0.85), Battery = dailyKwh × 0.80 × (1 - solarDaytimeFraction), Heat pump = (area × 100 W/m²) ÷ 1000 × 1.1)
- Apply hard rules: inverter 0.75-1.10 ratio, battery 0.5-2.0 of daily kWh, German 70% feed-in cap, roof area fit
- Return EXACTLY 3 variants in the order [margin, closeRate, ltv]
- Do NOT pick BoM brands (that's Reonic Agent's job — leave bom: {} as a stub for now, will be filled by recommendBom)

Constraints:
- Pure functions, no side effects
- No imports from React, Zustand, lib/api, lib/reonic
- Numbers rounded to 0 decimal for kWh, 1 decimal for kWp, 2 decimal for €

Tests at lib/sizing/__tests__/golden_profiles.test.ts must verify these 5 expected outputs (±10% on panel count):
1. Berlin family of 4: 5,200 kWh/yr, S 35° 60m² roof, gas → 14 panels (5.6 kWp), 10 kWh battery, 8 kW HP
2. Munich couple+EV: 8,500 kWh/yr, SW 30° 80m², oil → 22 panels (8.8 kWp), 15 kWh battery, 10 kW HP
3. Hamburg single: 2,100 kWh/yr, E-W split 40m², district → 8 panels (3.2 kWp), 5 kWh, NO HP
4. Frankfurt family: 12,000 kWh/yr, S 40° 100m², gas → 28 panels (11.2 kWp), battery, 12 kW HP
5. Large family + pool: high kWh, S 40° 100m², gas → 12 kW HP, large battery

Done when pnpm vitest lib/sizing passes all 5 profiles.
```

### Reonic Agent (Codex)
```
You are the Reonic Agent for Verdict.

Read lib/contracts.ts. Two deliverables:

1. scripts/csv_to_json.ts — one-time script. Read /Users/.../Downloads/2a8ba8e2/projects_status_quo.csv (1,277 rows, 36 cols) and project_options_parts.csv (19,257 rows, 15 cols). Clean and emit data/fixtures/projects.json + data/fixtures/line_items.json. Fix the unit bug: inverter_power_kw / battery_capacity_kwh / wb_charging_speed_kw store WATTS — divide by 1000.

2. lib/reonic/recommend.ts — export recommendBom(sizing: SizingResult, strategy: Strategy): BoM
   - KNN over projects.json with weighted overlap on non-null fields (energy_demand_wh, has_ev, has_storage, has_wallbox, heating_existing_type)
   - Tie-break by Jaccard similarity over line-item tokens
   - Strategy "margin" prefers high-margin brand combos (Huawei + EcoFlow / FoxESS dominant)
   - Strategy "closeRate" prefers most-frequent BoM in the cohort
   - Strategy "ltv" adds heat pump + larger battery + premium inverter
   - Output BoM matches contracts.ts BoM type exactly
   - ALWAYS cite exactly 3 distinct project IDs in the returned context (return as second value or attach to a hidden field)

Constraints:
- Deterministic — same inputs always produce same BoM
- No imports from React, Zustand, lib/api, lib/sizing
- Module loads projects.json once at import time (no fs reads during recommend calls)

Done when pnpm vitest lib/reonic passes:
- Each strategy returns a BoM with totalEur > 0
- Each call cites exactly 3 distinct project IDs
- Same inputs → same output (run 100 times, all results identical)
```

### UI Flow Agent (Claude)
```
You are the UI Flow Agent for Verdict.

Read lib/contracts.ts. Build:

- store/appStore.ts: Zustand store with persist middleware (localStorage), state shape { intake?: Intake, sizing?: SizingResult, selectedVariantId?: string, leadPacket?: LeadPacket, currentStep: "address"|"reveal"|"intake"|"variants"|"sent" }
- app/page.tsx: orchestrates the homeowner happy path. Uses Zustand for state, wires components/homeowner/* into the steps
- app/installer/page.tsx: shows incoming leads from Zustand (mock 1 for now), opens InstallerReview on click
- All API calls go through stubs in lib/api/* — call them via TanStack Query

Constraints:
- Consume contracts.ts only, do not edit it
- Do not import lib/sizing internals — call lib/sizing/calculate.ts as a black box
- Do not edit components/ui/* — that's the UI Polish stream
- Persist middleware: prefix the storage key with "verdict-v1-"

Done when:
- Filling the address + 4 fields and clicking through shows 3 variant cards
- Refreshing the page resumes at the same step (persist works)
- Installer page shows the lead and lets you click into InstallerReview
- pnpm tsc --noEmit passes
```

### API Resilience Agent (Claude)
```
You are the API Resilience Agent for Verdict.

Read lib/contracts.ts. Build all API client wrappers in lib/api/:

- places.ts: googlePlacesAutocomplete(query): Promise<{predictions: ..., apiStatus: ApiStatus}>
- solar.ts: getSolarBuildingInsights(lat, lng): Promise<{data: RawSolarResponse, apiStatus}>
- tiles.ts: 3D Tiles helper (returns CesiumJS-ready config object)
- gemini.ts: callGeminiStructured(prompt, schema): Promise<{data: T, apiStatus}> — raw fetch to https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent — POST, JSON body, parse response, validate against passed Zod schema, retry once on schema fail, fall back to deterministic template after second fail

Common pattern for ALL wrappers:
- 4-second timeout (AbortController)
- On timeout: return cached fixture, set apiStatus.source = "cached"
- On error: return cached fixture, set apiStatus.status = "error"
- On success: set apiStatus.source = "live", status = "ok", record latencyMs
- Cached fixtures live in data/fixtures/cached/{api}_{addressKey}.json

Plus lib/api-status/badge.tsx — small component <ApiStatusBadge status={apiStatus} /> rendering 🟢 Live or 🟡 Cached or 🔴 Error.

Constraints:
- Read GOOGLE_MAPS_API_KEY from process.env (server-side only for Solar/Tiles)
- Read NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for Places autocomplete (client-side OK)
- Read GEMINI_API_KEY from process.env (server-side only)
- No imports from React routing or Zustand
- Tests at lib/api/__tests__/resilience.test.ts must verify timeout fallback + error fallback + happy path

Done when pnpm vitest lib/api passes 6 cases (2 per critical wrapper).
```

---

## 8. STATUS.md — the cold-start anti-friction file

Every session that finishes meaningful work must overwrite `STATUS.md` with one line:

```
NEXT: <task name> by <ai name>  (last updated <ISO timestamp>)
```

Plus optionally a 1–2 sentence context line. A fresh AI session opening this repo runs:

```bash
cat STATUS.md
```

…and knows what to do next. **This is the single most important coordination artifact.** Without it, every session burns 30 minutes re-discovering state.

Initial `STATUS.md` (present at H+0):

```
NEXT: scaffold Next.js 15 app per BOOTSTRAP.md §2 by Claude Code  (2026-04-25T14:00:00Z)
```

---

## 9. Vercel deployment

- **Project name**: `verdict`
- **Domain**: `verdict-<hash>.vercel.app` for previews; promote to `verdict.vercel.app` (or whatever Vercel assigns) at Sun 13:30
- **Env vars** (set via `vercel env add` in §2):
  - `GEMINI_API_KEY` (server-only)
  - `GOOGLE_MAPS_API_KEY` (server-only — for Solar / Geocoding)
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-side — for Places autocomplete + Maps JS)
- **GitHub integration**: connect the `verdict` repo to the Vercel project once. After that, every push to `main` auto-deploys a preview.
- **Production promote**: only Claude runs `vercel deploy --prod` and only at Sun 13:30 after dress rehearsal #2 passes.

---

## 10. The single thing to pre-bake before Sprint 1 starts

`data/fixtures/golden_profiles.json` + 5 cached Solar API responses (one per safety address: Ruhr, Reichstag, Charlottenburg, Hamburg city, Munich). These remove 2+ hours of in-sprint friction around fake data and fallback. Bake them by Sat 13:00 (one hour before kickoff). Script: `scripts/prebake.ts` running against the live Solar API with the new key.

---

*Read this once. Read STATUS.md every time. Then build.*
