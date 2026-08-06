# AGENTS.md — `src/providers/`

**Owner path for connector definitions and executors.** Root iron rules still apply.

## Do

- Add/edit a **single provider** package under its own folder.
- Keep provider metadata next to that provider; no cross-provider barrels.
- Use guarded fetch / project request helpers (no global `fetch` in executors).
- After definition changes: `npm run generate:catalog` (and registry if needed).
- Prefer focused tests next to the provider or under existing provider test patterns.

## Do not

- Put **OrgConfig, members, teams, org policy, or company auth** here → use `src/company/`.
- Change Gateway kernel (`src/core/`) or OAuth refresh core unless the task explicitly requires it.
- Introduce `index.ts` barrel re-exports for the whole providers tree.
- Commit secrets or connection credentials into provider sources.

## Verify

```bash
npm run test:server   # often enough when only runtime-adjacent
# or full:
npm test
npm run generate:catalog   # if provider definitions changed
npm run check:boundaries
```

## Read when stuck

- Root [`AGENTS.md`](../../AGENTS.md) iron rules
- [`docs/runtime-api.md`](../../docs/runtime-api.md)
- [`docs/catalog-format.md`](../../docs/catalog-format.md)
