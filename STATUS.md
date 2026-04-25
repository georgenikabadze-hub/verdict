NEXT: Sprint 1 hour 2 — wire IntakeBottomSheet + VariantCardStack components, connect to Zustand store, render 3 mocked variant cards from sizeQuote()  (2026-04-25T18:10:00Z)

## Done so far
- Next.js 15 + Turbopack + Tailwind 4 + Inter + dark Tesla-precision palette ✓
- `lib/contracts.ts` — frozen draft (Intake, BoM, Variant, RoofSegment, SizingResult, ApiStatus, LeadPacket) ✓
- `data/schema.ts` — Zod schemas matching contracts ✓
- `lib/sizing/calculate.ts` — deterministic sizer with 3 strategies; 5 golden-profile tests passing ✓
- `lib/api/{places,solar,gemini,timeout}.ts` — wrappers with 4s timeout + Live/Cached fallback; 6 resilience tests passing ✓
- `lib/api-status/Badge.tsx` — Live/Cached/Error pill ✓
- `app/page.tsx` — minimal hero (Verdict wordmark + address input + pulsing live signal) ✓
- Tests: 11 passing total (5 sizer + 6 API resilience)
- Vercel: deployed to **https://verdict-gamma-ten.vercel.app** (HTTP 200, 285ms TTFB)
- Env vars set in production / preview / development

## Next session priorities (Sprint 1 H+2 → H+3)
1. `store/appStore.ts` — Zustand + persist middleware, state shape per BOOTSTRAP.md §7
2. `components/homeowner/IntakeBottomSheet.tsx` — 4-field intake (bill slider, EV toggle, heating segmented, goal segmented)
3. `components/homeowner/VariantCardStack.tsx` — 3 cards rendered from `SizingResult.variants`
4. `components/homeowner/LiveRoofFacts.tsx` — strip showing area/pitch/azimuth from Solar API response
5. Wire `app/page.tsx` to call sizer with mocked roof segments → display variants
6. `app/installer/page.tsx` + `components/installer/InstallerReview.tsx` (editable BoM rows + Recalculate button)

## Open
- `lib/reonic/recommend.ts` not yet written — sizer currently returns `citedProjectIds: ["P-001","P-002","P-003"]` placeholders. Needs CSV→JSON conversion + KNN recommender. (Reonic Agent prompt in BOOTSTRAP.md §7.)
- Ruhr.glb cinematic component (Sprint 3, S+8 hour)
- CesiumJS + Photorealistic 3D Tiles route (Sprint 3, S+11 hour)
- `app/api/quote/route.ts` orchestrator (Sprint 4, S+12 hour)
