# Verdict

> Reonic's installer-DNA quote intelligence layer.
> Built for Big Berlin Hack 2026 · Reonic track.

Reonic already automates the technical plan — layout, strings, inverter sizing, BoM. **Verdict automates the commercial judgment that experienced installers still do by hand**: which BoM the homeowner will actually sign, at what margin. *Automatisierung + Erfahrungswissen* — trained on Reonic's 1,277 completed projects and 19,257 real line items.

See [PLAN.md](./PLAN.md) for the concept, pitch, workstreams, and pre-mortem.

## Setup

```bash
git clone https://github.com/georgenikabadze-hub/verdict.git
cd verdict
cp .env.example .env.local   # fill in your own keys (never commit them)
```

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
