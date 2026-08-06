# Design system — OnMyCompany

OMA-style layout: `DESIGN.md` (contract) + `preview.html` (visual catalog).
**Preview CSS is isolated** and does not change `web/src/styles/*`.

Source language for product UI is **English**; Chinese lives only in `web/src/locales/zh-*.json`.

## Open previews

```bash
open docs/design/preview.html
open docs/design/preview-dark.html
```

## Files

| File                                                               | Role                          |
| ------------------------------------------------------------------ | ----------------------------- |
| [`../../DESIGN.md`](../../DESIGN.md)                               | Authoritative visual contract |
| [`preview.html`](./preview.html)                                   | Light catalog                 |
| [`preview-dark.html`](./preview-dark.html)                         | Dark catalog (same sections)  |
| [`preview.css`](./preview.css)                                     | Preview-only styles           |
| [`tokens-snapshot.json`](./tokens-snapshot.json)                   | Token snapshot                |
| [`../../web/src/styles/theme.css`](../../web/src/styles/theme.css) | Implementation SoT            |

## Checks (OMA-inspired)

```bash
npm run design:sync       # theme.css → tokens.json + tokens.generated.css
npm run check:design      # full gate (theme SoT, tokens, preview, no product hex)
npm run check:i18n:cjk    # no new hard-coded CJK in web/src
npm run check:pr-english  # PR title/body/commits English (self-test in npm run check)
npm run check             # typecheck + tests + design + cjk
```

After editing `web/src/styles/theme.css`:

```bash
npm run design:sync && npm run check:design
```

Regenerate CJK baseline after intentional reductions:

```bash
node scripts/checks/check-i18n-cjk.mjs --write
```

## Reference ranking

1. **Cal.com** — light SaaS + black CTA + 8px controls
2. **Vercel** — monochrome ladder + soft elevation
3. **Linear** — dark surfaces + scarce accent (`#7c9dff` ring)

## Product constraints

See [`web/PRODUCT.md`](../../web/PRODUCT.md): enterprise control plane, not chat workbench / marketing site.
