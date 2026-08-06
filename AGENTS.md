# AGENTS.md — OnMyCompany

**English** · [简体中文](AGENTS.zh-CN.md)

**Audience: AI agents / human developers.** Runbook, not a marketing page.

| Field                 | Value                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**           | OnMyCompany (enterprise control plane + Gateway)                                                                                       |
| **License**           | **Non-commercial** (`LICENSE`); commercial use needs a separate license. OMA is Apache-2.0                                             |
| **Desktop companion** | `../onmyagent` / WeaveQ OnMyAgent (Phase 2; minimal company integration landed)                                                        |
| **Current stage**     | **Pilot MVP + org/team IA Phase 1** — see [ROADMAP](docs/onmycompany/ROADMAP.md) · [TEAM-ISOLATION](docs/onmycompany/TEAM-ISOLATION.md) |
| **Verification**      | `npm run ci` (= Actions); layered `test:company` / `test:web` / `test:server`                                                          |
| **Architecture SoT**  | [`docs/Architecture.md`](docs/Architecture.md)                                                                                         |
| **Config SoT**        | [`docs/onmycompany/CONFIG-SCHEMA.md`](docs/onmycompany/CONFIG-SCHEMA.md)                                                               |
| **API paths**         | [`docs/onmycompany/API-NOTES.md`](docs/onmycompany/API-NOTES.md)                                                                       |
| **Dual-end contract** | [`docs/onmycompany/DESKTOP-CONTRACT.md`](docs/onmycompany/DESKTOP-CONTRACT.md)                                                         |

---

## 0. Read before you start (by task)

| Task type                       | Minimum reading                               |
| ------------------------------- | --------------------------------------------- |
| Any change                      | **Iron rules below** + Architecture §1–2      |
| Config / OrgConfig / policy     | CONFIG-SCHEMA + Architecture §3               |
| Auth / members / tokens         | BOOTSTRAP + RBAC + API-NOTES                  |
| Desktop integration / mocks     | DESKTOP-CONTRACT + OMA config-consistency     |
| Gateway / provider              | `docs/runtime-api.md` + coding conventions    |

Do **not** copy long desktop docs into this repo; link them:

- `../onmyagent/docs/Architecture.md`
- `../onmyagent/docs/design/2026-08-02-config-consistency.md`
- `../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md`
- `../onmyagent/AGENTS.md`

---

## 1. Iron rules (violations are bugs)

### Product and boundaries

1. **Touch Gateway core sparingly**: `src/core/`, provider main execution path, OAuth refresh — only when the task requires it.
2. **New company logic goes in `src/company/`**; never put Org/member logic into `providers/*`.
3. **External product name is only OnMyCompany** (+ desktop OnMyAgent).
4. **Not main-path**: enterprise approval queue, chat-to-cloud, hosted workspaces, public multi-tenant, CF/D1 as default deploy.

### Config isomorphism (aligned with OMA)

5. **local / company share one schema**. Switch pointers; do not fork product logic.
6. **OrgConfig is the company config source of truth**; desktop `profiles/company/config` is a mirror only.
7. **Policy single-write**: only write via OrgConfig `policy` and synthesize runtime-policy.
8. **config never contains secrets**.
9. **Memory body / chat / workspace do not enter OrgConfig**.

### Identity, execution, desktop

10. **ops-admin ≠ org-admin**.
11. **Attributed execution**: runtime-token binds member; runs carry `memberId`; MVP connections = **org-shared**.
12. **Credentials never return to the client**.
13. **Respect D1**: unauthenticated desktop must produce zero company traffic.
14. **Any Agent**: `/v1` · `/mcp` must work with curl/MCP clients.
15. **Verify after changes**: `npm test` / relevant vitest; `generate:catalog` when provider definitions change.

---

## 2. Layering overview

```text
OnMyAgent (desktop)                  OnMyCompany (this repo)
  OpenCode main / Personal aux         identity / OrgConfig / audit
  profiles/local|company/config  ◄──  isomorphic ──►  data/org/default/config
  local session · workspace            Gateway /v1 · MCP · connections
  Mode A fully usable when logged out  single process · SQLite (intranet)
```

| Do (this repo)                                      | Don't                             |
| --------------------------------------------------- | --------------------------------- |
| Org login, members, teams, bootstrap                | Desktop OpenCode main track       |
| OrgConfig CRUD · Skills catalog · export/import     | Local migration 2a (lives in OMA) |
| Policy synthesis, token↔member · logout revoke      | Second Electron policy truth      |
| Connection secrets, runs audit · lean usage metering| Employee chat-to-cloud / billing  |
| Admin console (overview/connections/teams/usage/Skills…) | Enterprise approval-queue main path |
| G0 concurrency caps · G1a connection primary/standby · office catalog | Default full LLM reverse-proxy (G1b) |
| Desktop company API + contract                      | Real Feishu production ticket exchange (stub exists) |

Diagram: [`docs/Architecture.md`](docs/Architecture.md). Path table: [`docs/onmycompany/API-NOTES.md`](docs/onmycompany/API-NOTES.md).

---

## 3. Repo map

```text
src/server/          # mounts company routes · concurrency guards · action-runner
src/core/            # execution & policy · office-catalog — touch sparingly
src/providers/       # connectors; production allowlist narrowed by catalog profile
src/company/         # ★ auth · teams · org-config · skills · audit · usage
web/                 # admin console (overview · app connections · teams · metering · more)
migrations/
docs/Architecture.md
docs/onmycompany/    # product engineering docs · API-NOTES · ROADMAP · GATEWAY plan
examples/
```

Mount: `registerCompanyRoutes` → same process as `/health`; see `src/server/connect-app.ts`.

---

## 4. Config & data (quick reference)

| Channel         | Path/API                                       | Notes                              |
| --------------- | ---------------------------------------------- | ---------------------------------- |
| ① OrgConfig     | `data/org/default/config` · `/api/org/config`  | **Isomorphic** with OMA profile config |
| ② UserData      | `/api/me/userdata/*`                           | Deferred; same-machine by default  |
| Secrets         | connections + encryption key                   | Server-side only                   |
| Desktop local   | `~/.onmyagent/profiles/local/config`           | 2a landed                          |
| Desktop company | `profiles/company/config`                      | Mirror after login                 |

Hard rules: [`CONFIG-SCHEMA.md`](docs/onmycompany/CONFIG-SCHEMA.md).

---

## 5. Commands

```bash
npm install
cp .env.example .env    # optional
npm run dev             # API :3100 + web :5180 (avoid clashing with OnMyAgent 5173/8787)
npm run dev:api
npm test
npm run test:affected   # slice company|web|server from git diff
npm run fix-check
npm run generate:catalog
```

Smoke:

```bash
curl -s http://localhost:3100/health
curl -s -X POST http://localhost:3100/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' -d '{"input":{}}'
```

---

## 6. Environment variables (minimum)

| Variable                       | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `PORT`                         | Default **3100** (matches `.env.example` / `dev-local`) |
| `OMC_DATA_DIR`                 | SQLite + org tree                                     |
| `OMC_ADMIN_TOKEN`              | ops-admin                                             |
| `OMC_ENCRYPTION_KEY`           | Credential encryption                                 |
| `OMC_ALLOWED_ACTIONS`          | Execution-surface allowlist                           |
| `OMC_BOOTSTRAP_ADMIN_EMAIL`    | First org-admin                                       |
| `OMC_CATALOG_PROFILE`          | `office` (default) / `full`                           |
| `OMC_ALLOWED_SERVICES`         | Override profile service list or `*`                  |
| `OMC_MAX_IN_FLIGHT`            | G0 global concurrency cap (default 100)               |
| `OMC_MAX_IN_FLIGHT_PER_MEMBER` | G0 per-member cap (default 10)                        |

**Canonical = `OMC_*`**. Full table: [`ENV.md`](docs/onmycompany/ENV.md).

---

## 7. Coding conventions (summary)

- One fact, one place; do not duplicate provider metadata in executors.
- No barrel `index.ts`; providers must not use global `fetch` (use guarded fetcher).
- `interface` for object contracts; oxfmt / oxlint; web code only under `web/`.
- `/v1` shape stays stable; extensions like `memberId` must be documented.
- Company route prefixes: `API-NOTES.md`.
- **Nested instructions (by directory):**
  - [`src/providers/AGENTS.md`](src/providers/AGENTS.md) — connector directory boundaries
  - [`src/company/AGENTS.md`](src/company/AGENTS.md) — company domain
  - [`src/server/AGENTS.md`](src/server/AGENTS.md) — Gateway HTTP / execution
  - [`web/AGENTS.md`](web/AGENTS.md) — admin console frontend

### Verification commands (mechanical gates)

| Command                    | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run ci`               | lint + format + typecheck + test + design + i18n-cjk + pr-english |
| `npm run check:boundaries` | company vs providers/core import boundaries                       |
| `npm run check:design`     | theme.css ↔ tokens snapshot                                       |
| `npm run test:affected`    | Slice company/web/server from `origin/main...HEAD` paths          |

### Harness / session evidence (Grok)

- When Better Harness audits this repo, use `--platform grok --workspace <absolute path to this repo>`.
- If `eligibleSessions=0` / `missing-required-root`: session root does not match current workspace — **do not** claim “no one is developing” from that alone; first confirm Grok session cwd/workspace binding.
- Product code acceptance is **CI / `npm run ci`**, not harness session counts.

---

## 8. Division of labor with OMA agent

| Repo            | Owns                                                   | Forbidden                                      |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| **This repo**   | Company server, Gateway, admin console, OrgConfig      | Changing OMA desktop main business path        |
| **onmyagent**   | 2a solidify, 2b BaseUrl/login/mirror config, Gateway client | Enterprise DB/policy editing truth in Electron |

Contract changes: update `DESKTOP-CONTRACT` + `CONFIG-SCHEMA` + API-NOTES first, then both codebases.

---

## 9. Stage checklist

- [ ] Read iron rules + Architecture §1
- [ ] Config-related? → CONFIG-SCHEMA
- [ ] Desktop-related? → DESKTOP-CONTRACT; zero traffic when logged out
- [ ] policy? → still single-write entry
- [ ] connections? → still org-shared
- [ ] Finish with `npm run fix-check` (or document why skipped)

---

## 10. Links

| Resource              | Path                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| README                | [README.md](README.md) · [中文](README.zh-CN.md)                       |
| Architecture          | [docs/Architecture.md](docs/Architecture.md)                           |
| Product engineering   | [docs/onmycompany/README.md](docs/onmycompany/README.md)               |
| Roadmap               | [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md)             |
| Runtime API           | [docs/runtime-api.md](docs/runtime-api.md)                             |
| Desktop Architecture  | [../onmyagent/docs/Architecture.md](../onmyagent/docs/Architecture.md) |
