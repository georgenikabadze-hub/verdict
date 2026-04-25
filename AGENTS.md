# AGENTS.md

> Read this first if you are an AI coding agent (Claude Code, Codex CLI, Gemini CLI, Cursor, Copilot, etc.) opening this repo. This file is the canonical map of where code lives, who owns what, and the rules of the road.

---

## What this repo is

**Verdict** — an AI solar-quote tool for German homeowners. Built for Big Berlin Hack 2026 (Reonic track) in 24 hours.

Type your address → see a satellite of your roof → answer 4 questions → get 3 BoM variants grounded in 1,277 real Reonic projects → send to a certified installer → installer reviews/edits/approves → final BoM lands back on your phone.

Live at **https://verdict-gamma-ten.vercel.app** · GitHub at **github.com/georgenikabadze-hub/verdict**

---

## Where to start

| Reading order | File | Why |
|---|---|---|
| 1 | `AGENTS.md` (this file) | Repo map + ownership |
| 2 | `STATUS.md` | What was last shipped + what's next |
| 3 | `docs/PLAN.md` | Product spec + locked decisions |
| 4 | `docs/SPRINT.md` | Hour-by-hour execution plan |
| 5 | `docs/BOOTSTRAP.md` | Self-bootstrapping setup commands + sub-agent prompts |
| 6 | `lib/contracts.ts` | The frozen TypeScript types (the central seam) |

If `STATUS.md` says a sprint is in progress, work on that. Don't go back to refactor things from earlier sprints unless they block forward progress.

---

## File tree (where code lives)

```
verdict/
├── app/                              # Next.js 15 App Router routes
│   ├── layout.tsx                    # Root layout, Inter font, dark theme
│   ├── page.tsx                      # Homeowner landing (renders <HomeShell />)
│   ├── globals.css                   # Tailwind 4 + CSS-var color tokens
│   ├── quote/
│   │   └── page.tsx                  # Server route — calls sizer + renders 3 variants
│   ├── installer/
│   │   └── page.tsx                  # Installer review screen
│   └── api/
│       ├── quote/route.ts            # GET ?address= → JSON: geo + sizing
│       ├── reverse-geocode/route.ts  # GET ?lat=&lng= → human address
│       ├── forward-geocode/route.ts  # GET ?q= → lat/lng
│       └── roof-facts/route.ts       # GET ?lat=&lng= → Solar API roof segments
│
├── components/
│   ├── homeowner/
│   │   ├── HomeShell.tsx             # Two-pane layout (3D left, intake right)
│   │   ├── IntakePanel.tsx           # Address + 4-field form + CTA
│   │   ├── RoofPreview.tsx           # Static satellite image fallback
│   │   ├── RoofMap3D.tsx             # Rotatable Google Maps 3D view (preferred)
│   │   ├── LiveRoofFacts.tsx         # Glass strip showing live Solar API segments
│   │   ├── VariantCardStack.tsx      # 3 variant cards stack
│   │   └── SendToInstaller.tsx       # CTA + confirmation state
│   ├── installer/
│   │   └── InstallerReview.tsx       # Editable BoM + Recalculate + Approve
│   └── ui/                           # shadcn primitives (currently sparse)
│
├── lib/
│   ├── contracts.ts                  # FROZEN — Intake/BoM/Variant/SizingResult types
│   ├── parse-coords.ts               # Wraps `coordinate-parser` for decimal+DMS input
│   ├── sizing/
│   │   ├── calculate.ts              # sizeQuote() + sizeQuoteWithRationale() — pure math
│   │   ├── rationale.ts              # Gemini-LLM-generated variant rationale
│   │   └── __tests__/                # Vitest — golden profiles + hard rules
│   ├── reonic/
│   │   ├── recommend.ts              # KNN over 1,277 projects → BoM brand selection
│   │   └── __tests__/                # Vitest — KNN determinism + cited-IDs
│   ├── api/
│   │   ├── places.ts                 # Google Places autocomplete wrapper
│   │   ├── solar.ts                  # Google Solar API wrapper
│   │   ├── gemini.ts                 # Raw fetch to Gemini REST + Zod validation
│   │   ├── timeout.ts                # withTimeout() helper (4-second default)
│   │   └── __tests__/                # Vitest — resilience + timeout behavior
│   └── api-status/
│       └── Badge.tsx                 # Live/Cached/Error pill component
│
├── store/                            # Zustand stores (sparse — most state is local)
│
├── data/
│   ├── schema.ts                     # Zod schemas matching lib/contracts.ts
│   └── fixtures/
│       ├── projects.json             # 1,277 cleaned Reonic projects
│       ├── line_items.json           # 19,257 cleaned line items, units fixed
│       └── cached/                   # Pre-fetched Solar API responses for safety addresses
│
├── scripts/
│   └── csv_to_json.ts                # One-off: Reonic CSV → JSON fixtures (fixes unit bugs)
│
├── e2e/
│   └── hero.spec.ts                  # Playwright smoke tests on the deployed URL
│
├── docs/
│   ├── PLAN.md                       # Product spec + locked design decisions
│   ├── SPRINT.md                     # 6×4h sprint execution plan + per-hour exits
│   └── BOOTSTRAP.md                  # Bootstrap commands + sub-agent prompts
│
├── public/                           # Static assets (Next.js convention)
├── AGENTS.md                         # This file
├── README.md                         # Public-facing intro + quick start
├── STATUS.md                         # Cold-start coordination — what's next + by whom
├── LICENSE                           # MIT
├── .env.example                      # Public template; never holds real keys
├── .env.local                        # Gitignored, holds GEMINI_API_KEY + GOOGLE_MAPS_API_KEY
└── .gitignore                        # Strict — covers .env*, node_modules, .next, .vercel, etc.
```

---

## Per-AI ownership (avoid merge conflicts)

When multiple AI assistants are working on this repo at the same time, each owns specific paths. **Do not edit another AI's files without coordinating first.**

| Assistant | Owns these paths exclusively |
|---|---|
| **Claude Code** | `app/`, `lib/api/`, `lib/api-status/`, `store/`, `AGENTS.md`, `STATUS.md`, `README.md`, `docs/`, `.gitignore`, `.env.example`, `package.json`, `next.config.ts`, `tsconfig.json`, all git/deploy commands, every PR review |
| **Codex CLI** | `lib/contracts.ts`, `data/schema.ts`, `lib/sizing/`, `lib/reonic/`, `lib/parse-coords.ts`, `scripts/`, `data/fixtures/`, all `__tests__/` directories under `lib/` |
| **Gemini CLI** | `components/ui/`, `components/homeowner/RoofMap3D.tsx`, `components/homeowner/RoofPreview.tsx`, `components/homeowner/LiveRoofFacts.tsx`, `components/installer/`, `app/globals.css`, Tailwind config, animation polish |

Other paths (e.g. `components/homeowner/HomeShell.tsx`, `app/quote/page.tsx`) are integration code owned by Claude. They glue the workstreams together and can be edited by any AI **only as a single-line wiring change**.

---

## Hard rules (do not break)

1. **`lib/contracts.ts` is FROZEN.** Edits require integration captain (Claude) sign-off. Adding optional fields is fine; renaming or removing fields breaks every workstream.
2. **The LLM never outputs geometry.** Panel counts, areas, kWp values come from `lib/sizing/calculate.ts` (pure deterministic math). Gemini only writes rationale strings.
3. **Sizer is pure.** `sizeQuote()` has no side effects, no async, no API calls. Every change must keep the 5 golden-profile tests passing (`pnpm test lib/sizing`).
4. **Reonic recommender is deterministic.** Same `(intake, sizing, strategy)` → same `BoM` every time. No `Math.random()`, no `Date.now()` in scoring.
5. **Every API wrapper has a 4-second timeout + cached fallback.** See `lib/api/timeout.ts`. The Live/Cached badge must reflect the actual source — never silent.
6. **All UI in English.** Reonic is a German company; we keep their German feature names when referencing them in marketing copy, but the product UI is English.
7. **Color tokens (use these EXACTLY):**
   - Background `#0A0E1A` / Surface `#12161C` / Border `#2A3038`
   - Foreground `#F7F8FA` / Muted `#9BA3AF`
   - Accent `#3DAEFF` (neon blue) / Success `#62E6A7` (live badge) / Warning `#F2B84B` (cached badge)
   - **No** purple gradients, no rainbow, no animated blobs, no `rounded-full` (max 8px radius)
8. **Never commit credentials.** `.env.local` is gitignored; `.env.example` only holds placeholders. If you see an `AIza...` string in any committed file, that's a security incident.

---

## Tech stack (locked)

| Layer | Pick |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript strict |
| Styling | Tailwind 4 + CSS-var tokens |
| 3D — interactive | Google Maps JS API (`@googlemaps/js-api-loader` v2 functional API) with `tilt: 45` + `rotateControl` |
| 3D — cinematic (Sprint 3, planned) | react-three-fiber + DRACOLoader for Ruhr.glb |
| Forms | Native React `useState` (Zod for validation, no React Hook Form yet) |
| State | Local component state + occasional Zustand (no global app store) |
| Data fetching | Native `fetch` with `AbortSignal.timeout()` |
| LLM | Raw `fetch` to `generativelanguage.googleapis.com` (NOT the Google AI SDK) |
| Coord parsing | `coordinate-parser` (handles decimal + DMS + many formats) |
| Tests | Vitest (unit) + Playwright (e2e) |
| Deploy | Vercel (CLI: `vercel deploy --prod --scope georgenikabadze-4272s-projects`) |
| Package manager | `pnpm@9.12.0` (NOT npm or Bun) |
| Node | 22 LTS |

---

## Common commands

```bash
# Local dev
pnpm install                    # one-time
pnpm dev                        # localhost:3000 with Turbopack hot-reload

# Tests
pnpm test                       # vitest run (unit tests)
pnpm test:e2e                   # playwright on the live deploy
pnpm tsc --noEmit               # type-check only

# Build + deploy
pnpm build                      # production build (Vercel runs this)
vercel deploy --prod --scope georgenikabadze-4272s-projects
```

---

## API key setup

`.env.local` holds:
- `GEMINI_API_KEY=AIzaSy...` (Workshop key, restricted to Gemini API only)
- `GOOGLE_MAPS_API_KEY=AIzaSy...` (server-side — Solar / Static Maps / Geocoding)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...` (client-side — Maps JS API + Places autocomplete)

Both keys live in the same Google Cloud project (`bigberlin-hack26ber-3262`). They are workshop-issued, free for the hackathon.

---

## When you finish a session

Overwrite `STATUS.md` with one line:
```
NEXT: <task name> by <ai name>  (last updated <ISO timestamp>)
```
Plus optionally one or two sentences of context. The next AI session opening this repo should be able to read `STATUS.md` and know exactly what to do.

---

## When in doubt

- Check the failing test (`pnpm test`) — it usually points at the contract drift
- Re-read `lib/contracts.ts` — it's the central seam
- Don't refactor "while you're here" — every minute on existing code is a minute not building Sprint 3/4 features
- If you must change `lib/contracts.ts`, mention it in your commit message and update `AGENTS.md` if the field semantics change
