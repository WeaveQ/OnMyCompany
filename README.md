# OnMyCompany

**English** · [简体中文](README.zh-CN.md)

**Enterprise agent control plane + outbound Gateway** (intranet pilot; **not open for commercial use**).

|                    |                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Product**        | OnMyCompany                                                                                                  |
| **Desktop companion** | [OnMyAgent](https://github.com/WeaveQ/OnMyAgent) (Apache-2.0, local-first)                                |
| **Repository**     | https://github.com/WeaveQ/OnMyCompany                                                                        |
| **MVP deploy**     | Docker Compose + SQLite                                                                                      |
| **Stage**          | **Pilot main path complete** (gap-close · G0/G1a/G2 · office catalog · org/team IA Phase 1)                |
| **License**        | **Source-available non-commercial** — see `LICENSE` / `NOTICE`; commercial use needs a separate license. OnMyAgent remains Apache-2.0. |

---

## What it does

```text
OnMyCompany = one process / one primary port
├── Gateway
│   · connections / OAuth · /v1 Actions · MCP · policy · runtime token · runs
│   · G0 concurrency caps · G1a connection primary/standby · attributed memberId
├── Company layer (src/company/ · MVP landed)
│   · login / members / teams · OrgConfig · Skills · policy · audit · usage
└── Admin console (web/)
    · overview · app connections · org accounts · teams · org settings
    · observability: metering · runs · audit · Skills · API keys
```

**In scope**: identity, org Skill/expert/model config, credentials & outbound, policy, audit, lean metering.  
**Out of scope**: employee local chat, workspace directory layout, enterprise approval-queue as main path, public multi-tenant SaaS, default full LLM reverse-proxy.

Any agent (OnMyAgent / curl / MCP client) can call `/v1` or `/mcp` with a runtime token.  
Company HTTP path table: [docs/onmycompany/API-NOTES.md](docs/onmycompany/API-NOTES.md).

---

## Dev & test scripts (OMA-style layering)

Requires **Node.js 22.18+** (24 recommended).

| Command                            | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                      | Local API + admin console                                  |
| `npm test`                         | Full vitest suite                                          |
| `npm run test:company`             | Company layer `src/company`                                |
| `npm run test:web`                 | Admin console `web/src`                                    |
| `npm run test:server`              | Gateway `src/server`                                       |
| `npm run test:unit`                | Backend `src`                                              |
| `npm run typecheck` / `check:type` | Typecheck                                                  |
| `npm run check`                    | typecheck + test                                           |
| `npm run ci` / `verify`            | lint + format + typecheck + test (matches GitHub Actions)  |
| `npm run check:docs`               | API-NOTES ↔ routes check                                   |

CI: `.github/workflows/ci.yml` runs `npm run ci` on `main` / `feat/**` / PRs.

## 5-minute local setup

```bash
cd /path/to/onmycompany
cp .env.example .env
npm install
npm run dev
```

| Entry                          | URL                                                      |
| ------------------------------ | -------------------------------------------------------- |
| API / OpenAPI                  | http://127.0.0.1:3100 · http://127.0.0.1:3100/docs       |
| Health                         | http://127.0.0.1:3100/health · `GET /api/company/health` |
| Admin console                  | http://127.0.0.1:5180                                    |
| OmniRoute model sidecar (opt.) | http://127.0.0.1:20128 · `npm run dev:omniroute`         |

Company login (dev OTP): `admin@company.internal` + `OMC_DEV_OTP` (default `000000`).  
Runtime execution example (for token minting see `data/TEST-CREDENTIALS.txt` or the console):

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H "Authorization: Bearer <runtime-token>" \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Production-oriented env:

```bash
export OMC_ADMIN_TOKEN="…"
export OMC_ENCRYPTION_KEY="…"
export OMC_DATA_DIR="$PWD/data"
export OMC_ALLOWED_ACTIONS="hackernews.*,github.*"
export OMC_CATALOG_PROFILE=office   # default; full = full 1000+ apps
```

Env reference: [docs/onmycompany/ENV.md](docs/onmycompany/ENV.md) · [docs/configuration.md](docs/configuration.md)

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

---

## Docs map

| Doc                                                                                              | Purpose                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **[AGENTS.md](AGENTS.md)** / [中文](AGENTS.zh-CN.md)                                             | Dev / agent runbook                                  |
| **[docs/Architecture.md](docs/Architecture.md)**                                                 | System architecture · layering with OnMyAgent        |
| **[docs/onmycompany/CONFIG-SCHEMA.md](docs/onmycompany/CONFIG-SCHEMA.md)**                       | Config isomorphism                                   |
| **[docs/onmycompany/DESKTOP-CONTRACT.md](docs/onmycompany/DESKTOP-CONTRACT.md)**                 | Dual-end contract                                    |
| **[docs/onmycompany/API-NOTES.md](docs/onmycompany/API-NOTES.md)**                               | Company HTTP paths (aligned with `src/company/routes.ts`) |
| [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md)                                       | Completeness · deferred items · **goal status**      |
| [docs/onmycompany/GATEWAY-OBSERVABILITY-PLAN.md](docs/onmycompany/GATEWAY-OBSERVABILITY-PLAN.md) | G0/G1a/G2 plan and landing                           |
| [docs/onmycompany/ENV.md](docs/onmycompany/ENV.md)                                               | `OMC_*` environment variables                        |
| [docs/runtime-api.md](docs/runtime-api.md)                                                       | `/v1` · MCP · OpenAPI (Gateway)                      |
| [docs/configuration.md](docs/configuration.md)                                                   | Configuration guide                                  |

**Desktop side:**

| Topic        | Path                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Architecture | [`../onmyagent/docs/Architecture.md`](../onmyagent/docs/Architecture.md)                                                           |
| Config 2a    | [`../onmyagent/docs/design/2026-08-02-config-consistency.md`](../onmyagent/docs/design/2026-08-02-config-consistency.md)           |
| Phase 2      | [`../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md`](../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md) |

---

## Config isomorphism (at a glance)

```text
Desktop ~/.onmyagent/profiles/{local|company}/config/
Company $DATA_DIR/org/default/config/
        └── manifest · models · policy · memory/settings
            skills · experts · tools/{mcp,gateway}
```

Details: [CONFIG-SCHEMA.md](docs/onmycompany/CONFIG-SCHEMA.md).

---

## Repository layout

```text
src/
  core/          # execution, policy, office-catalog
  providers/     # connectors
  server/        # HTTP · guards · mounts company routes
  company/       # company logic (auth · teams · skills · org-config · audit · usage)
  oauth/ mcp/ …
web/             # admin console (overview · connections · teams · metering · Skills…)
migrations/
docs/
  Architecture.md
  onmycompany/   # product engineering docs · API-NOTES · ROADMAP
examples/
```

---

## Dev commands

| Command                                 | Description                          |
| --------------------------------------- | ------------------------------------ |
| `npm run dev`                           | API `:3100` + Web `:5180`            |
| `npm run dev:api`                       | API only                             |
| `npm run dev:omniroute`                 | OmniRoute model sidecar `:20128` (B) |
| `npm run omniroute:up`                  | Start OmniRoute sidecar via Docker   |
| `npm test`                              | vitest                               |
| `npm run fix-check`                     | lint + format + typecheck            |
| `node scripts/check-docs-api-notes.mjs` | API-NOTES ↔ routes consistency       |
| `npm run generate:catalog`              | After provider definition changes    |
| `npm run generate:registry`             | Provider registry                    |

---

## Engineering stages (summary)

| Stage                 | Status | Goal                                                         |
| --------------------- | ------ | ------------------------------------------------------------ |
| **M0–M7**             | ✅     | Gateway + org identity + OrgConfig + admin console + minimal desktop link |
| **Skills S1–S5**      | ✅     | Org/personal Skills catalog and sharing                      |
| **Gap-close**         | ✅     | P7/P5 audit/export/members                                   |
| **G0 / G1a / G2**     | ✅     | Concurrency caps · connection primary/standby · lean metering |
| **Office catalog**    | ✅     | Default office allowlist + ready-to-use + doc filters        |
| **G1b / G3 / real Feishu** | ⏳ | Optional or deferred                                      |

Details: [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md).

---

## Explicit non-goals (MVP)

- Public multi-tenant SaaS / commercial prepaid billing
- Enterprise approval queue as main path
- Chat-to-cloud, hosted employee workspaces
- Cloudflare / D1 as default deploy
- Default reverse-proxy of all LLM chat into Gateway (G1b only after promotion)

---

## License

- Code: Apache-2.0 — see `LICENSE.txt`.
- Third-party service trademarks used only for interoperability identification — see `NOTICE.md`.

<!-- ci: pr gate -->
