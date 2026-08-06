# Architecture / code audit — OnMyCompany company stack

| Field | Value |
|-------|--------|
| Date | 2026-08-03 |
| Scope | `src/company/**`, company mount/auth, management web company surfaces |
| Method | Code inventory + targeted tests; three optimization loops |

## Findings

| ID | Severity | Module | Finding | Disposition |
|----|----------|--------|---------|-------------|
| F1 | **High** | `web/src/members-page.tsx` | Dead page after `/members` → `/team` redirect; still duplicates login + `authHeaders` | **Fixed L1** — removed; route stays redirect |
| F2 | **Med** | `web/src/*-page.tsx` | Duplicated `authHeaders` / `omc_member_token` session read across skills, team, org-config, overview | **Fixed L1** — shared `web/src/member-session.ts` |
| F3 | **Med** | `src/company/routes.ts` (~974 LOC) | Error mapping / JSON body / requireMember helpers co-located with all route registration | **Fixed L2** — extract `src/company/http.ts` |
| F4 | **Med** | `src/company/**/writeJson` | `mkdir(join(path,".."))` instead of `dirname` (fragile path edge cases) | **Fixed L3** — use `dirname` |
| F5 | **Low** | `src/server/api/auth.ts` | Admin session cookie still named `oomol_connect_admin_session` (legacy brand) | **Deferred** — dual-name migration would log out ops sessions; track as rebrand residual |
| F6 | **Info** | Auth public paths | `/api/teams` must stay ops-admin-bypass (regressed once) | **Closed** — covered by auth tests + docs check |
| F7 | **Info** | Docs | API-NOTES / stage language | Already aligned in prior goal; check script extended |

## Loops

| Loop | Changes | Tests |
|------|---------|--------|
| 1 | Shared member session helper; remove dead `members-page` | web unit + company |
| 2 | Extract company HTTP helpers; slim `routes.ts` imports | company routes/teams |
| 3 | `dirname` writeJson; `COMPANY_PRODUCT_PUBLIC_*` constants; docs-check parses constants | auth + docs check |

## Deferred (out of scope for this goal)

- Real Feishu OAuth ticket exchange  
- Mass provider catalog cleanup  
- Full routes.ts split into per-domain routers (larger than three safe loops)  
- Cookie rename `oomol_connect_admin_session` → `omc_*` with dual-read migration  

## Verdict

Company stack architecture is **coherent** (single Hono process, member session for product APIs, OrgConfig single-write). This goal removes dead/dup web code, consolidates helpers, and hardens path/auth consistency without product expansion.
