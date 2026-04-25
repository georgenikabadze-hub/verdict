# Verdict

> Reonic's installer-DNA quote intelligence layer.
> Built for Big Berlin Hack 2026 · Reonic track.

Reonic already automates the technical plan — layout, strings, inverter sizing, BoM. **Verdict generates the homeowner-facing experience that turns a curious visitor into a Verdict-Qualified Lead** — measured roof, real bill, intent, recommended Reonic-grounded BoM. *Automation + experience-based knowledge* — trained on Reonic's 1,277 completed projects and 19,257 real line items.

**The MVP is the full loop**: homeowner types address → cinematic 3D house reveal → 4-field intake → recommended variant + 2 alternatives → "Send to installer" CTA → installer reviews & adjusts → second touch lands back on the homeowner phone with the approved final BoM. All UI in English.

## Quick start

```bash
pnpm install
pnpm dev       # localhost:3000
pnpm test      # vitest unit tests
pnpm test:e2e  # playwright smoke tests on the live deploy
```

## Setup

```bash
git clone https://github.com/georgenikabadze-hub/verdict.git
cd verdict
cp .env.example .env.local   # fill in your own keys (never commit them)
```

## Project docs

- [Plan](./docs/PLAN.md) — full concept, pitch, build stages, wireframes, and pre-mortem.
- [Sprint](./docs/SPRINT.md) — sprint cadence and delivery checkpoints.
- [Bootstrap](./docs/BOOTSTRAP.md) — cold-start protocol and AI workstream ownership.
- [Status](./STATUS.md) — current build state and next handoff.
- [Contributing](./docs/CONTRIBUTING.md) — contributor ownership map.
- [Landing mockup](./docs/landing-mockup.png) — visual reference.

## Partner technologies (3 of 7 required — final picks decided at the hackathon)

| Partner | Could power | Likelihood |
|---|---|---|
| **Google Gemini** (Deepmind) | Quote intelligence engine, "why this wins" rationale, chat refinement | Almost certain |
| **Lovable** | v0 UI scaffold of comparison cards + installer-DNA panel | Likely |
| **Tavily** | One call for current local electricity tariff (honest ROI) | Likely |
| **Gradium** (voice) | Hands-free quote refinement (optional polish) | Maybe |
| **Pioneer/Fastino** | Fine-tune small model on 1,257 paired projects | Maybe |
| **Entire** | Agent orchestration | Unlikely |
| **Aikido** | Security scan (side prize €1k, not 1 of 3) | Yes |

Plus (not partner techs but needed): **Google Maps Platform** (Solar API + 3D Tiles), **Vercel** (hosting).

## Security

- No credentials in this repo, ever. Strict `.gitignore`, `.env.example` only.
- Datasets are not committed — fetched locally from the shared hackathon Drive.

## License

MIT — see [LICENSE](./LICENSE).
