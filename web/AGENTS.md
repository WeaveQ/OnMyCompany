# AGENTS.md — `web/`

**OnMyCompany admin console** (Vite + React). English source strings; zh-CN/zh-TW only in `web/src/locales/*`.

## Do

- UI tokens from `web/src/styles/theme.css` (see root `DESIGN.md`).
- After theme token edits: `npm run design:sync && npm run check:design`.
- Prefer `npm run test:web` for page/unit tests under `web/src`.
- Console density: monochrome primary CTA; brand color for focus/ring only.

## Do not

- Hard-code new CJK user-visible copy in TSX (gate: `npm run check:i18n:cjk`).
- Hard-code hex colors in product CSS outside `theme.css`.
- Call backend with secrets displayed to the browser.

## Verify

```bash
npm run test:web
npm run check:design
npm run check:i18n:cjk
# UI: http://127.0.0.1:5180/ (API :3100)
```

## Read when stuck

- Root [`DESIGN.md`](../DESIGN.md)
- [`docs/design/README.md`](../docs/design/README.md)
- Root [`AGENTS.md`](../AGENTS.md)
