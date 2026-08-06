---
spec: stitch-design-md/v-alpha
product: OnMyCompany
platform: web-console
authority: active
maintenance: manual
last-reviewed: 2026-08-06
# Preview (OMA-style, does NOT change product CSS):
#   docs/design/preview.html
#   docs/design/preview-dark.html
#   docs/design/preview.css
# Implementation SoT:
#   web/src/styles/theme.css
version: alpha
name: OnMyCompany-console-design
description: >
  Enterprise control-plane console (OnMyCompany admin). Light-first white canvas,
  near-black primary CTAs, soft periwinkle brand ring (#7c9dff), SF Pro / system
  stack, dense sidebar + table UI. shadcn base-nova + neutral CSS variables.
  Design language ranked against VoltAgent/awesome-design-md: Cal.com (primary),
  Vercel (secondary for monochrome ladder), Linear (dark surfaces + accent scarcity).
  Preview layout mirrors OnMyAgent docs/design/preview.html.
source_repo: https://github.com/VoltAgent/awesome-design-md
oma_reference: ../onmyagent/docs/design/preview.html
primary_reference: design-md/cal
secondary_references:
  - design-md/vercel
  - design-md/linear.app
implementation:
  css: web/src/styles/theme.css
  shell: web/src/styles/shell.css
  polish: web/src/styles/console-polish.css
  tokens_json: data/org/default/config/design/tokens.json
  preview: docs/design/preview.html
  components: web/components.json (shadcn base-nova, baseColor neutral)

colors:
  # ── Light (default product) — mapped from :root in theme.css ──
  canvas: "#ffffff"
  canvas-soft: "#f8f8f8"
  surface-card: "#ffffff"
  surface-muted: "#f4f4f4"
  surface-secondary: "#f6f6f6"
  surface-accent: "#f0f0f0"
  ink: "#292929"
  ink-muted: "color-mix(oklab, #292929 55%, transparent)"
  hairline: "#e9e9e9"
  primary: "#292929"
  on-primary: "#ffffff"
  brand: "#7c9dff"
  brand-foreground: "#ffffff"
  ring: "#7c9dff"
  info: "#3b63fb"
  success: "#05834e"
  warning: "#fc7d00"
  reward: "#fc7d00"
  destructive: "#d73220"
  sidebar: "#f8f8f8"
  sidebar-accent: "#e9e9e9"
  sidebar-border: "#e9e9e9"
  # ── Dark (.dark) ──
  dark-canvas: "#111111"
  dark-surface-1: "#1b1b1b"
  dark-surface-2: "#222222"
  dark-surface-3: "#393939"
  dark-ink: "#ebebeb"
  dark-hairline: "#393939"
  dark-primary: "#ebebeb"
  dark-on-primary: "#111111"
  dark-brand: "#7c9dff"
  dark-sidebar: "#1b1b1b"
  dark-success: "#068850"
  dark-warning: "#da9f00"
  dark-destructive: "#df3422"
  dark-info: "#4069fd"
  info: "#3b63fb"
  reward: "#fc7d00"

typography:
  font-sans: "SF Pro Text, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Noto Sans, Helvetica, Arial, sans-serif"
  font-sans-zh-CN: "SF Pro SC, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, system-ui, sans-serif"
  font-sans-zh-TW: "SF Pro TC, SF Pro Text, PingFang TC, Microsoft JhengHei, Noto Sans TC, system-ui, sans-serif"
  font-mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
  page-title:
    fontSize: 20px
    fontWeight: 650
    lineHeight: 1.25
  section-title:
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  button:
    fontSize: 13px
    fontWeight: 520
    lineHeight: 1.2
  mono-id:
    fontSize: 12px
    fontWeight: 400
    fontFamily: "{typography.font-mono}"

rounded:
  sm: "calc(0.5rem * 0.6)" # ~4.8px
  md: "calc(0.5rem * 0.8)" # ~6.4px
  lg: "0.5rem" # 8px — buttons, inputs, nav items
  xl: "calc(0.5rem * 1.4)" # ~11.2px — cards
  "2xl": "calc(0.5rem * 1.8)"
  pill: 9999px
  full: 9999px
  base: "0.5rem"

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 15.5rem
  content-min: 1240px
  nav-item-height: 36px
  header-height: 56px
  button-sm-height: 32px
  button-md-height: 36px
  input-height: 36px

shadow:
  console-sm: "0 1px 2px color-mix(in oklch, black 5%, transparent), 0 0 1px color-mix(in oklch, black 8%, transparent)"
  console-md: "0 2px 6px color-mix(in oklch, black 6%, transparent), 0 1px 2px color-mix(in oklch, black 8%, transparent)"
  modal: "0 14px 40px color-mix(in oklab, var(--foreground) 12%, transparent)"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    typography: "{typography.button}"
    height: "{spacing.button-md-height}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
  console-card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    shadow: "{shadow.console-sm}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    borderColor: "{colors.sidebar-border}"
    width: "{spacing.sidebar-width}"
  nav-item:
    height: "{spacing.nav-item-height}"
    rounded: "{rounded.lg}"
    fontSize: 14px
  nav-item-active:
    backgroundColor: "{colors.sidebar-accent}"
  text-input:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    height: "{spacing.input-height}"
    focusRing: "{colors.ring}"
  status-pill-ok:
    backgroundColor: "color-mix(in oklab, {colors.success} 14%, transparent)"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
  status-pill-warn:
    backgroundColor: "color-mix(in oklab, {colors.warning} 16%, transparent)"
    textColor: "#b45309"
    rounded: "{rounded.pill}"
  status-pill-muted:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
  filter-chip:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
  filter-chip-active:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    shadow: "{shadow.console-sm}"
  data-table:
    headerColor: "{colors.ink-muted}"
    rowBorder: "{colors.hairline}"
    hoverBackground: "color-mix(in oklab, {colors.surface-muted} 70%, transparent)"
  modal:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.xl}"
    shadow: "{shadow.modal}"
---

# OnMyCompany Console — DESIGN.md

> Visual contract for AI agents and humans on the **OnMyCompany 管理台** (enterprise control plane).  
> Status: **active** — product CSS should follow these tokens; preview remains the visual catalog.
>
> | What                   | Where                                                            |
> | ---------------------- | ---------------------------------------------------------------- |
> | Light preview          | [`docs/design/preview.html`](docs/design/preview.html)           |
> | Dark preview           | [`docs/design/preview-dark.html`](docs/design/preview-dark.html) |
> | Live product CSS (SoT) | `web/src/styles/theme.css`                                       |
> | Org config tokens      | `data/org/default/config/design/tokens.json`                     |
> | OMA sibling preview    | `onmyagent/docs/design/preview.html`                             |

## 0. Why this reference (awesome-design-md scan)

Scanned [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) against this product’s live tokens (`theme.css`, shell, console-polish, PRODUCT.md).

| Rank                  | Brand                                                                                       | Fit   | Why                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · Primary**       | **[Cal.com](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/cal)**       | ★★★★★ | White canvas + **near-black primary CTA** + **8px button radius** + soft gray cards + dense SaaS product chrome. Closest to “企业管控后台” not marketing hero.                      |
| **2 · Secondary**     | **[Vercel](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/vercel)**     | ★★★★  | Monochrome ink ladder, hairline borders, stacked soft elevation, developer-platform calm. Use for gray scale + card depth; **do not** copy marketing 100px pills or mesh gradients. |
| **3 · Dark / accent** | **[Linear](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/linear.app)** | ★★★★  | Surface ladder in dark mode, **scarce chromatic accent**, SF Pro family. Our brand `#7c9dff` is the soft cousin of Linear lavender — use for ring/focus only.                       |
| Avoid as system base  | Stripe / Airbnb / Spotify / Runway                                                          | —     | Marketing gradients, photography-first, or entertainment density — conflicts with PRODUCT anti-references.                                                                          |

**Decision:** Adopt **Cal.com product patterns** as the default mental model; map tokens to **existing OMC CSS variables** (do not rebrand to Cal blue). Dark mode borrows Linear surface steps; elevation borrows Vercel soft stacks (already as `--console-shadow-*`).

## 1. Visual Theme & Atmosphere

- **Role:** Enterprise Agent 管控后台 — org config, connections, team, audit. Not a chat workbench (that is OnMyAgent).
- **Mood:** 克制、可信、内网工具。Clear hierarchy over decoration.
- **Density:** Medium-high — tables, filters, sidebar; breathing room in page heroes only.
- **Default theme:** Light. Dark is first-class via `.dark` + same semantic names.
- **No:** mesh gradients, hero marketing bands, decorative illustration as primary chrome.

## 2. Color Palette & Roles

### Light (source of truth: `:root`)

| Role          | Token / CSS var              | Hex / value   | Use                                                  |
| ------------- | ---------------------------- | ------------- | ---------------------------------------------------- |
| Canvas        | `--background`               | `#ffffff`     | Page floor                                           |
| Ink           | `--foreground` / `--primary` | `#292929`     | Body text **and** primary CTA fill                   |
| On primary    | `--primary-foreground`       | `#ffffff`     | Text on primary buttons                              |
| Muted surface | `--muted`                    | `#f4f4f4`     | Chips, inset tracks, zebra                           |
| Muted text    | `--muted-foreground`         | ~55% ink      | Meta, table headers, hints                           |
| Border        | `--border` / `--input`       | `#e9e9e9`     | Hairlines, inputs                                    |
| Brand         | `--brand` / `--ring`         | **`#7c9dff`** | Focus ring, charts, brand mark — **not** default CTA |
| Sidebar       | `--sidebar`                  | `#f8f8f8`     | Left rail                                            |
| Success       | `--success`                  | `#05834e`     | Active / healthy                                     |
| Warning       | `--warning` / `--reward`     | `#fc7d00`     | Pending / caution                                    |
| Destructive   | `--destructive`              | `#d73220`     | Delete, errors                                       |
| Info          | `--info`                     | `#3b63fb`     | Informational                                        |

### Dark (`.dark`)

| Role            | CSS var                      | Value                 |
| --------------- | ---------------------------- | --------------------- |
| Canvas          | `--background`               | `#111111`             |
| Card            | `--card`                     | `#1b1b1b`             |
| Popover         | `--popover`                  | `#222222`             |
| Ink / primary   | `--foreground` / `--primary` | `#ebebeb`             |
| Border / accent | `--border` / `--accent`      | `#393939`             |
| Brand           | `--brand`                    | `#7c9dff` (unchanged) |
| Success         | `--success`                  | `#068850`             |
| Warning         | `--warning`                  | `#da9f00`             |
| Destructive     | `--destructive`              | `#df3422`             |
| Info            | `--info`                     | `#4069fd`             |

### Accent scarcity (Linear rule, adapted)

- **Primary actions** = near-black (light) / near-white (dark) — never brand blue fills for “添加成员 / 保存”.
- **Brand periwinkle** = focus rings, selection outline, chart-1, occasional link emphasis.
- Status colors only for lifecycle pills (未激活 / 已启用 / 已停用).

## 3. Typography

- **Sans:** SF Pro Text stack (macOS native; Chinese stacks under `html[lang=zh-CN|zh-TW]`).
- **Mono:** system mono for team IDs, token snippets, code.
- **Console scale is compact** (product, not marketing display-xl):
  - Page title ~20px / 650
  - Section ~15px / 600
  - Body 14px / 400
  - Caption / meta 12px
  - Buttons 13px / ~520
- Do **not** import Cal Sans / Geist as hard deps unless product brand changes — system SF Pro is intentional (OOMOL-adjacent).

## 4. Component Stylings

### Buttons

| Variant             | Look                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| Primary             | `{colors.primary}` fill, white text, `{rounded.lg}` 8px, height ~32–36px |
| Outline / secondary | White + hairline border                                                  |
| Ghost               | Transparent, muted label (e.g. “应用连接” link-button)                   |
| Destructive icon    | Danger tint on icon button, not full-width red CTA unless confirm modal  |

**Anti-pattern:** Vercel marketing 100px pill CTAs inside console pages.

### Cards & tables

- `.console-card` / team shell: white card, hairline, soft `--console-shadow-sm`.
- Tables: 12–13px meta, status pills, hover wash on row.
- Empty states: muted text + single primary CTA.

### Filters (people, runs, connections)

- Segmented track (muted fill + active white chip) — Cal `nav-pill-group` / our `team-people-tabs`.
- Status: `is-ok` | `is-warn` | `is-muted` pills.

### Sidebar

- Width `15.5rem`, sticky, bottom team switcher + account gear.
- Nav item min-height 36px, active = sidebar-accent wash.

### Modal

- `ConsoleModal`: card surface, soft modal shadow, footer outline + primary pair.

## 5. Layout Principles

- Shell: **sidebar | main** CSS grid.
- Main content min comfort ~1240px (org-config / team tables).
- Spacing base **4px**; section gaps 16–24px inside pages, not marketing 96px heroes on every route.
- Page stack: optional short hero title + lead, then console-card work surface.

## 6. Depth & Elevation

| Level       | Treatment                           |
| ----------- | ----------------------------------- |
| 0 Flat      | Page background                     |
| 1 Hairline  | Inputs, table rules, sidebar border |
| 2 Soft card | `--console-shadow-sm`               |
| 3 Raised    | `--console-shadow-md`, popovers     |
| 4 Modal     | Large soft shadow, no glassmorphism |

Prefer **border + surface** over heavy Material shadows (Vercel soft stack, Cal soft drop).

## 7. Do’s and Don’ts

### Do

- Map new UI to **CSS variables** (`var(--primary)`, `var(--muted)`, …) — never hardcode random grays.
- Keep primary CTA monochrome; brand blue for focus/ring only.
- Reuse `ConsoleModal`, status pills, filter chips from console-polish.
- Support light + dark with the same semantic names.
- Preserve Chinese font stacks for zh-CN / zh-TW.

### Don’t

- Don’t recolor the product to Linear lavender or Cal blue wholesale.
- Don’t add mesh gradients / cinematic dark heroes (PRODUCT anti-references).
- Don’t invent a second people model (本团队 vs 组织全员) in UI chrome — use status filters.
- Don’t use `rounded-full` for ordinary CTAs (pills only for status / avatars / filter tracks).

## 8. Responsive Behavior

- Sidebar may collapse / stack on narrow viewports; keep touch targets ≥36–40px.
- Tables scroll horizontally inside `.team-manage-table-wrap` rather than crushing columns.
- Filter chips wrap; actions stack under identity on small screens (console-polish media queries).

## 9. Agent Prompt Guide (quick)

When generating UI for this repo:

```
Use OnMyCompany DESIGN.md + web/src/styles/theme.css tokens.
Primary button: near-black (#292929) on light, not brand blue.
Brand #7c9dff only for focus ring / charts.
Radius 8px (--radius) for buttons/inputs; cards slightly larger.
Style reference: Cal.com product SaaS density; elevation like soft Vercel cards;
dark mode surface steps like Linear. No marketing mesh gradients.
Components: shadcn/ui already in web/components; prefer Button/Input/Label.
```

### CSS var cheat sheet

```css
background, foreground, card, popover,
primary, primary-foreground,
secondary, muted, muted-foreground, accent,
brand, brand-foreground, ring,
destructive, success, warning, info,
border, input, sidebar*, chart-1…5,
--radius, --console-shadow-sm, --console-shadow-md
```

## 10. Known gaps / follow-ups

- Org config does not yet expose a “Theme” admin page; tokens file is the backend SoT for agents + future UI.
- Chart palette reuses brand/info/success — fine for metering; refine if multi-series collision.
- Align OnMyAgent `DESIGN.md` only where shared brand hex matters; product shells differ (chat vs control plane).
