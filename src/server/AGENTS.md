# AGENTS.md — `src/server/`

**Gateway HTTP process**: connect-server, action runner, runtime tokens, storage, API surface.

## Do

- Keep `/v1` and `/mcp` shapes stable; document extensions in API-NOTES / runtime-api.
- Attribute runs when member-bound tokens exist (`memberId`).
- Use project secret codec and stores; never log credentials.
- Prefer `npm run test:server` for local feedback.

## Do not

- Move OrgConfig CRUD into random server files when it belongs in `src/company/`.
- Bypass concurrency / policy guards without an explicit task.
- Commit local `data/*.sqlite` or real tokens.

## Verify

```bash
npm run test:server
npm run dev:api   # API default :3100
curl -s http://127.0.0.1:3100/health
```

## Read when stuck

- Root [`AGENTS.md`](../../AGENTS.md)
- [`docs/runtime-api.md`](../../docs/runtime-api.md)
- [`docs/onmycompany/API-NOTES.md`](../../docs/onmycompany/API-NOTES.md)
