#!/usr/bin/env node
/**
 * Extract design tokens from web/src/styles/theme.css (implementation SoT)
 * and write:
 *   - data/org/default/config/design/tokens.json
 *   - docs/design/tokens-snapshot.json
 *   - docs/design/tokens.generated.css  (shared vars for preview.html)
 *
 *   node scripts/design/sync-tokens.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const themePath = join(repoRoot, "web/src/styles/theme.css");
const outOrg = join(repoRoot, "data/org/default/config/design/tokens.json");
const outSnap = join(repoRoot, "docs/design/tokens-snapshot.json");
const outPreviewCss = join(repoRoot, "docs/design/tokens.generated.css");

const theme = readFileSync(themePath, "utf8");

function extractBlock(css, marker) {
  const idx = css.search(new RegExp(`${marker.replace(".", "\\.")}\\s*\\{`));
  if (idx < 0) throw new Error(`Block not found: ${marker}`);
  const start = css.indexOf("{", idx);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  throw new Error(`Unclosed block: ${marker}`);
}

function parseVars(block) {
  /** @type {Record<string, string>} */
  const out = {};
  // Support multi-line custom properties ending at `;`
  const re = /(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

function rgbToHex(value) {
  const m = value.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

const light = parseVars(extractBlock(theme, ":root"));
const dark = parseVars(extractBlock(theme, ".dark"));

const colorKeys = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--brand",
  "--brand-foreground",
  "--destructive",
  "--info",
  "--reward",
  "--success",
  "--warning",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-border",
  "--sidebar-ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
];

function pickColors(vars) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of colorKeys) {
    if (vars[k] !== undefined) out[k.replace(/^--/, "")] = vars[k];
  }
  return out;
}

const payload = {
  schemaVersion: 2,
  name: "onmycompany-console",
  updatedAt: new Date().toISOString().slice(0, 10),
  source: {
    awesomeDesignMd: "https://github.com/VoltAgent/awesome-design-md",
    primaryReference: "cal",
    secondaryReferences: ["vercel", "linear.app"],
    rationale:
      "Light enterprise console: white canvas + near-black CTA (Cal/Vercel) + scarce periwinkle brand #7c9dff (Linear-like accent) + SF Pro.",
    generatedBy: "scripts/design/sync-tokens.mjs",
  },
  cssSource: "web/src/styles/theme.css",
  designMd: "DESIGN.md",
  colors: {
    light: pickColors(light),
    dark: pickColors(dark),
  },
  hex: {
    ink: rgbToHex(light["--foreground"]),
    canvas: rgbToHex(light["--background"]),
    brand: rgbToHex(light["--brand"]),
    hairline: rgbToHex(light["--border"]),
    sidebar: rgbToHex(light["--sidebar"]),
    muted: rgbToHex(light["--muted"]),
    info: rgbToHex(light["--info"]),
    success: rgbToHex(light["--success"]),
    warning: rgbToHex(light["--warning"]),
    destructive: rgbToHex(light["--destructive"]),
    reward: rgbToHex(light["--reward"]),
    ring: rgbToHex(light["--ring"]),
    darkCanvas: rgbToHex(dark["--background"]),
    darkCard: rgbToHex(dark["--card"]),
    darkInk: rgbToHex(dark["--foreground"]),
    darkBorder: rgbToHex(dark["--border"]),
    darkSidebar: rgbToHex(dark["--sidebar"]),
    darkSuccess: rgbToHex(dark["--success"]),
    darkWarning: rgbToHex(dark["--warning"]),
    darkDestructive: rgbToHex(dark["--destructive"]),
    darkInfo: rgbToHex(dark["--info"]),
  },
  radius: {
    base: light["--radius"] || "0.5rem",
    sm: "calc(var(--radius) * 0.6)",
    md: "calc(var(--radius) * 0.8)",
    lg: "var(--radius)",
    xl: "calc(var(--radius) * 1.4)",
    pill: "9999px",
  },
  shadows: {
    consoleSm: light["--console-shadow-sm"],
    consoleMd: light["--console-shadow-md"],
  },
  typography: {
    fontSans: light["--oomol-font-sans"],
    fontMono: light["--oomol-font-mono"],
    scale: {
      pageTitle: { size: 20, weight: 650 },
      sectionTitle: { size: 15, weight: 600 },
      body: { size: 14, weight: 400 },
      caption: { size: 12, weight: 400 },
      button: { size: 13, weight: 520 },
    },
  },
  spacing: {
    base: 4,
    sidebarWidth: "15.5rem",
    navItemHeight: 36,
    headerHeight: 56,
  },
  components: {
    buttonPrimary: { bg: "primary", fg: "primary-foreground", radius: "lg" },
    statusPill: { active: "success", pending: "warning", deactivated: "muted" },
    filterChipActive: { bg: "card", shadow: "console-sm" },
  },
  rules: [
    "Primary CTA is monochrome ink, not brand blue",
    "Brand #7c9dff for focus ring and charts only",
    "No marketing mesh gradients",
    "Prefer CSS variables from theme.css over hardcoded hex in components",
    "Source of truth is web/src/styles/theme.css; run sync-tokens.mjs after theme edits",
  ],
};

function emitThemeMirror(vars, selector) {
  const lines = [`${selector} {`];
  for (const [k, v] of Object.entries(vars)) {
    if (
      k.startsWith("--background") ||
      k.startsWith("--foreground") ||
      k.startsWith("--card") ||
      k.startsWith("--popover") ||
      k.startsWith("--primary") ||
      k.startsWith("--secondary") ||
      k.startsWith("--muted") ||
      k.startsWith("--accent") ||
      k.startsWith("--brand") ||
      k.startsWith("--destructive") ||
      k.startsWith("--info") ||
      k.startsWith("--reward") ||
      k.startsWith("--success") ||
      k.startsWith("--warning") ||
      k.startsWith("--border") ||
      k.startsWith("--input") ||
      k.startsWith("--ring") ||
      k.startsWith("--sidebar") ||
      k.startsWith("--chart") ||
      k.startsWith("--radius") ||
      k.startsWith("--console-shadow") ||
      k.startsWith("--oomol-font")
    ) {
      lines.push(`  ${k}: ${v};`);
    }
  }
  // preview aliases → theme semantic names (single chain)
  lines.push(`  --pv-canvas: var(--background);`);
  lines.push(`  --pv-background: var(--background);`);
  lines.push(`  --pv-surface: var(--card);`);
  lines.push(`  --pv-surface-muted: var(--muted);`);
  lines.push(`  --pv-surface-secondary: var(--secondary);`);
  lines.push(`  --pv-surface-accent: var(--accent);`);
  lines.push(`  --pv-sidebar: var(--sidebar);`);
  lines.push(`  --pv-sidebar-accent: var(--sidebar-accent);`);
  lines.push(`  --pv-ink: var(--foreground);`);
  lines.push(`  --pv-ink-muted: var(--muted-foreground);`);
  lines.push(`  --pv-border: var(--border);`);
  lines.push(`  --pv-primary: var(--primary);`);
  lines.push(`  --pv-on-primary: var(--primary-foreground);`);
  lines.push(`  --pv-brand: var(--brand);`);
  lines.push(`  --pv-brand-soft: color-mix(in oklab, var(--brand) 14%, var(--card));`);
  lines.push(`  --pv-ring: var(--ring);`);
  lines.push(`  --pv-info: var(--info);`);
  lines.push(`  --pv-success: var(--success);`);
  lines.push(`  --pv-success-soft: color-mix(in oklab, var(--success) 14%, transparent);`);
  lines.push(`  --pv-warning: var(--warning);`);
  lines.push(`  --pv-warning-soft: color-mix(in oklab, var(--warning) 16%, transparent);`);
  lines.push(`  --pv-warning-fg: color-mix(in oklab, var(--warning) 72%, var(--foreground));`);
  lines.push(`  --pv-danger: var(--destructive);`);
  lines.push(`  --pv-danger-soft: color-mix(in oklab, var(--destructive) 12%, transparent);`);
  lines.push(`  --pv-code-bg: var(--muted);`);
  lines.push(`  --pv-shadow-sm: var(--console-shadow-sm);`);
  lines.push(`  --pv-shadow-md: var(--console-shadow-md);`);
  lines.push(`  --pv-shadow-modal: 0 14px 40px color-mix(in oklab, var(--foreground) 12%, transparent);`);
  lines.push(`  --pv-radius: var(--radius);`);
  lines.push(`  --pv-radius-sm: calc(var(--radius) * 0.6);`);
  lines.push(`  --pv-radius-md: calc(var(--radius) * 0.8);`);
  lines.push(`  --pv-radius-xl: calc(var(--radius) * 1.4);`);
  lines.push(`  --pv-font-sans: var(--oomol-font-sans);`);
  lines.push(`  --pv-font-mono: var(--oomol-font-mono);`);
  lines.push(`}`);
  return lines.join("\n");
}

const lightSelector = ':root,\n[data-theme="light"]';
const darkSelector = '[data-theme="dark"],\n.dark';
const generatedCss = [
  "/* AUTO-GENERATED by scripts/design/sync-tokens.mjs — do not edit by hand.",
  " * Source: web/src/styles/theme.css",
  " */",
  emitThemeMirror(light, lightSelector),
  "",
  emitThemeMirror(dark, darkSelector),
  "",
].join("\n");

mkdirSync(dirname(outOrg), { recursive: true });
mkdirSync(dirname(outSnap), { recursive: true });
const json = `${JSON.stringify(payload, null, 2)}\n`;
writeFileSync(outOrg, json);
writeFileSync(outSnap, json);
writeFileSync(outPreviewCss, generatedCss);

console.log(`sync-tokens: wrote`);
console.log(`  ${outOrg}`);
console.log(`  ${outSnap}`);
console.log(`  ${outPreviewCss}`);
console.log(
  `  light colors: ${Object.keys(payload.colors.light).length}, dark: ${Object.keys(payload.colors.dark).length}`,
);
