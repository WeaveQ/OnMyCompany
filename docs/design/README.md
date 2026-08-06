# Design system — OnMyCompany

## Canonical files

| File                                                                                             | Role                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [`/DESIGN.md`](../../DESIGN.md)                                                                  | Agent-facing design system (Stitch / awesome-design-md format) |
| [`data/org/default/config/design/tokens.json`](../../data/org/default/config/design/tokens.json) | Backend org-config copy of design tokens                       |
| [`web/src/styles/theme.css`](../../web/src/styles/theme.css)                                     | Live CSS variables (implementation SoT)                        |

## Reference ranking (awesome-design-md)

1. **Cal.com** — primary fit for light SaaS console + black CTA + 8px controls
2. **Vercel** — monochrome ladder + soft elevation (not marketing pills/gradients)
3. **Linear** — dark surface steps + scarce accent; brand `#7c9dff` is our ring color

Upstream catalog: https://github.com/VoltAgent/awesome-design-md

## Product constraints

See [`web/PRODUCT.md`](../../web/PRODUCT.md): enterprise control plane, not chat workbench / not marketing site.
