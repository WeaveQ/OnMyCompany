# Contributing — OnMyCompany

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

> **License**: This repository is **source-available non-commercial** (see `LICENSE`). Contributions are licensed under those terms; **commercial deployment requires a separate WeaveQ agreement**.  
> Companion desktop [OnMyAgent](https://github.com/WeaveQ/OnMyAgent) is Apache-2.0 under different terms.

## Development setup

```bash
cp .env.example .env   # optional
npm install
npm run dev            # API :3100 + web :5180 (see .env)
npm test               # full suite
npm run ci             # same as GitHub Actions
```

Read:

1. [AGENTS.md](AGENTS.md) / [中文](AGENTS.zh-CN.md)
2. [docs/onmycompany/README.md](docs/onmycompany/README.md)
3. [docs/onmycompany/RBAC.md](docs/onmycompany/RBAC.md) · [TEAM-ISOLATION.md](docs/onmycompany/TEAM-ISOLATION.md)

## Before a merge request

```bash
npm run ci
# or layered:
npm run test:company && npm run test:web
npm run check:docs   # if company routes changed
```

When provider definitions change:

```bash
npm run generate:catalog
```

## Where to put code

| Change type                         | Location                                  |
| ----------------------------------- | ----------------------------------------- |
| Org identity / OrgConfig / audit    | `src/company/`                            |
| Route mounting                      | Thin changes in `src/server/`             |
| Gateway execution / providers       | Only with reason: `src/core` / `src/providers` |
| Admin console                       | `web/`                                    |
| Product docs                        | `docs/onmycompany/`                       |

## Adding providers

Source of truth: `src/providers/<service>/definition.ts` (+ actions/executors).  
Then `npm run generate:catalog`.  
Tighten the execution surface in production with `OMC_ALLOWED_ACTIONS` and related env vars.

## Secrets

Do not commit tokens, keys, or customer configuration.

## Third-party rights

Do not commit third-party logos, icons, screenshots, or brand assets without rights.
