# AGENTS.md — `src/company/`

**Enterprise control-plane domain** (identity, org config, teams, skills, audit, policy synthesis).

## Do

- New org/member/team/policy/skills logic **starts here**.
- Keep OrgConfig schema compatible with desktop company profile (see CONFIG-SCHEMA).
- Policy write path: OrgConfig `policy` only → synthesize runtime-policy.
- Prefer `src/company/**/*.test.ts` and `npm run test:company`.

## Do not

- Leak secrets into config JSON or API responses.
- Implement company features inside `src/providers/*`.
- Treat ops-admin console unlock as org-admin product identity.
- Put chat transcripts / workspace files into OrgConfig.

## Verify

```bash
npm run test:company
npm run check:boundaries
# policy / config docs:
# docs/onmycompany/CONFIG-SCHEMA.md · RBAC.md · API-NOTES.md
```

## Read when stuck

- Root [`AGENTS.md`](../../AGENTS.md)
- [`docs/onmycompany/CONFIG-SCHEMA.md`](../../docs/onmycompany/CONFIG-SCHEMA.md)
- [`docs/onmycompany/RBAC.md`](../../docs/onmycompany/RBAC.md)
- [`docs/onmycompany/API-NOTES.md`](../../docs/onmycompany/API-NOTES.md)
