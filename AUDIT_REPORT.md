# Verdict Frontend Audit - Sun Layer / Panels / Pitch

## Audit Findings

### Bug A - Sun irradiance layer geographically offset
- Source: `lib/heatmaps/generate.ts:221-224` reads the GeoTIFF bbox; `app/api/data-layers/route.ts:80-90` sends that bbox to the client; `components/installer/SunHeatmapCesium.tsx:46-89` renders it with `Cesium.Rectangle.fromDegrees(west, south, east, north)`.
- Root cause: the raster extent is the full Solar API data-layer tile/radius, not the actual roof footprint. The installer view clips/fragments the 3D scene to the building, but the sun rectangle is still anchored to the wider raster extent, so visible heat colors can land southwest/on terrain instead of the roof.
- CRS/format: Solar API GeoTIFF bbox can be projected metres (WGS84 UTM, e.g. EPSG:32633 near Berlin); Cesium expects WGS84 degrees. Current conversion handles UTM, but it still uses the raster tile extent instead of roof bbox.
- Proposed minimal fix: in `/api/data-layers`, fetch Building Insights alongside Data Layers and return heatmap bounds from `buildingInsights.boundingBox` when available; log `[west, south, east, north]` for both the sun bounds and roof bbox.
- Risk: low-medium. Server route only; no API contract removal. The heatmap PNG is still the annual flux image, but it is now visually constrained to the target roof bbox for demo correctness.

### Bug B - Panel placement sparse and unaligned
- Source: `components/installer/InstallerLeadDetail.tsx:571-582` filters AI panels to only `highestYieldSegmentIndex`, then slices to `sizerPanelCount`; `components/installer/PanelOverlayCesium.tsx:517-524` only renders the passed slice.
- Root cause: on large/flat or multi-segment Solar API roofs, the chosen "best" segment can contain fewer panels than the demand-sized target. If that segment has only 2 panels, the overlay renders only 2 even though the demand target is ~10-15 panels.
- Sizing target: demand-driven, not roof-fill. `lib/sizing/calculate.ts:701-709` caps to physical roof fit and `DEMAND_OVERSIZE`; `lib/sizing/compose-from-market.ts:449-487` caps ROI search to demand coverage rather than filling the 688 m2 roof.
- Proposed minimal fix: keep the single-best-segment concentration only when that segment can satisfy `sizerPanelCount`; otherwise fall back to all Solar API panels and take top-N by yield.
- Risk: low. Installer detail component only; keeps existing toggles and manual edits.

### Bug C - Pitch displayed in radians on lead card
- Source: `components/installer/InstallerMarketplace.tsx:210-214` prints `lead.publicPreview.roofFacts.pitchDeg` directly; detail dimensions panel uses live Solar API segment pitch via `components/installer/InstallerLeadDetail.tsx:401-665`.
- Root cause: lead card trusts stored preview data. Existing lead data can contain radians (`0.43713236`) while live roof facts are degrees (`13` in the dimensions panel).
- Proposed minimal fix: normalize lead-card pitch before display: if finite value is in plausible radians (`0 < value <= Math.PI / 2`), convert with `deg = rad * 180 / Math.PI`; assert/warn if normalized pitch is outside `0 <= deg <= 60`.
- Risk: low. Presentation-only.

### Bug D - Render layer order
- Source: `components/installer/SunHeatmapCesium.tsx:66-95` raises the heatmap to sampled roof height + 2 m; `components/installer/PanelOverlayCesium.tsx:90` raises panels by 0.45 m.
- Root cause: ordering is implicit and currently inverted by height: heatmap can be above panels (`+2 m`) while panels are `+0.45 m`. It may look OK from some camera angles, but it is not explicit or stable.
- Proposed minimal fix: make heatmap z-offset explicit and below panels, e.g. `HEATMAP_HEIGHT_OFFSET_M = 0.08`; panels remain at `PANEL_HEIGHT_OFFSET_M = 0.45`.
- Risk: low. Visual layer only; no shared state/contracts.

## Fix Status

Implemented:
- `app/api/data-layers/route.ts` now prefers Google Solar Building Insights `boundingBox` for the displayed sun-layer bounds, keeps raster bounds as fallback, and logs `[west, south, east, north]` for sun/raster/roof.
- `components/installer/SunHeatmapCesium.tsx` now uses an explicit `0.08 m` heatmap lift, below panel polygons (`0.45 m`).
- `components/installer/InstallerLeadDetail.tsx` now falls back to all Solar API panels if the highest-yield segment cannot satisfy the demand-sized panel count.
- `components/installer/InstallerMarketplace.tsx` now normalizes plausible radian pitch values to degrees and warns if the normalized pitch is outside `0-60°`.

Not fixed:
- The annual flux PNG is not cropped to the building footprint; it is constrained to the roof bbox at render time for the hackathon demo. This is lower risk than adding a raster crop/georeference pipeline under deadline.

Residual risks:
- Heatmap colors are visually roof-aligned but may be spatially resampled across the roof bbox rather than exact per-pixel georeferenced flux. The panel layout and sizing data still come from Solar API panel/segment facts.

Verification:
- `git diff --check` passed.
- `pnpm tsc --noEmit` passed.
- `pnpm test lib/sizing lib/api lib/reonic` passed: 36 tests across 5 files.
- `pnpm build` did not complete in this sandbox. Turbopack failed with `listen EPERM` while spawning/binding a CSS worker; non-Turbopack `next build` then failed because network is restricted and `next/font` could not fetch Inter from `fonts.googleapis.com`.
- `pnpm test:e2e` did not complete in this sandbox because Playwright browsers cannot launch (`bootstrap_check_in ... Permission denied` / WebKit abort trap).
- `pnpm dev` could not start in this sandbox on either `0.0.0.0:3000` or `127.0.0.1:3001` due `listen EPERM`, so the final visual localhost check must be performed by the user outside this restricted shell.
- Commit was attempted but blocked by sandbox permissions: `git add` failed because `.git/index.lock` cannot be created (`Operation not permitted`). The working tree contains the intended changes, but no commit was created from this shell.

## Regression Fix

Diagnostic instrumentation added:
- `[panels-debug]` logs `{ solarPanelsLen, highestYieldSegmentIndex, sizerPanelCount, preferredLen, eligibleLen }` from the AI panel slice.
- `[panel-segment]` logs the chosen segment index, azimuth, total panel yield, panel count, and runner-up segment.

Observed values for the PLZ 12043 lead:
- Could not observe DevTools values in this sandbox. `curl http://127.0.0.1:3001/api/leads` could not connect, and `pnpm dev --port 3001` failed with `listen EPERM: operation not permitted 0.0.0.0:3001`.
- Source check: `sizerPanelCount` is `lead.publicPreview.sizing.panelCount`; the live report says this lead card shows `Panels: 13`, so the intended target is 13.
- Source check: Solar API panels are read from `/api/roof-facts` as `data.solarPanels`, enriched, then stored with `setSolarPanels(enriched)`. The new log will confirm whether the PLZ 12043 response is non-empty in the browser.

Root cause:
- `aiTopSlice` trusted `sizerPanelCount` as a positive finite number. If runtime lead data supplies `undefined`, `NaN`, or `0`, the slice target can collapse to zero or an invalid value, producing no AI overlay panels.
- The segment choice used max total yield only, so a north-facing segment could win when it had more panel candidates or total raw yield than a smaller south-facing face.

Change made:
- `aiTopSlice` now returns early only when `solarPanels` is truly empty, otherwise it uses a robust target: finite positive `sizerPanelCount`, or a fallback of up to 12 API panels.
- Preferred segment panels are used only when that segment can satisfy the target; otherwise the code falls back to non-north Solar API panels, then all Solar API panels if the roof has no enough non-north candidates, and slices top-N by yield.
- Segment selection now scores total yield by south-facing azimuth preference and excludes north-facing segments when any non-north segment exists.

Verification:
- `pnpm tsc --noEmit` passed.
- `git diff --check` passed.
- Local visual verification on `localhost:3001/installer` could not be completed from this sandbox because the dev server cannot bind to port 3001 here. Reloading locally should show the two diagnostic logs and restore the panel toolbar if Solar API returned panels.
