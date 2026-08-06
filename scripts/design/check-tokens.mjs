#!/usr/bin/env node
/**
 * Design token gate (OMA-inspired):
 * 1) theme.css is SoT for rgb values
 * 2) DESIGN.md documents core hex
 * 3) tokens.json / snapshot match theme extract
 * 4) preview tokens.generated.css mirrors theme rgb
 * 5) light/dark preview.html section parity
 *
 *   node scripts/design/check-tokens.mjs
 *   node scripts/design/check-tokens.mjs --strict
 *   node scripts/design/check-tokens.mjs --sync   # run sync-tokens first
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const strict = process.argv.includes("--strict");
const doSync = process.argv.includes("--sync");

if (doSync) {
  const r = spawnSync(process.execPath, [join(repoRoot, "scripts/design/sync-tokens.mjs")], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const themeCss = readFileSync(join(repoRoot, "web/src/styles/theme.css"), "utf8");
const designMd = readFileSync(join(repoRoot, "DESIGN.md"), "utf8");
const issues = [];

function extractBlock(css, marker) {
  const re = new RegExp(`${marker.replace(".", "\\.")}\\s*\\{`);
  const m = css.match(re);
  if (!m || m.index === undefined) return "";
  const start = css.indexOf("{", m.index);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  return "";
}

function parseVars(block) {
  /** @type {Record<string, string>} */
  const out = {};
  const re = /(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

function rgbToHex(value) {
  const m = String(value || "").match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

const light = parseVars(extractBlock(themeCss, ":root"));
const dark = parseVars(extractBlock(themeCss, ".dark"));

/** Core palette that must exist in DESIGN.md prose/YAML */
const designRequiredHex = [
  ["brand", light["--brand"]],
  ["ink", light["--foreground"]],
  ["canvas", light["--background"]],
  ["success", light["--success"]],
  ["warning", light["--warning"]],
  ["destructive", light["--destructive"]],
  ["info", light["--info"]],
  ["hairline", light["--border"]],
  ["dark canvas", dark["--background"]],
  ["dark ink", dark["--foreground"]],
  ["dark card", dark["--card"]],
  ["dark border", dark["--border"]],
];

for (const [name, rgb] of designRequiredHex) {
  const hex = rgbToHex(rgb);
  if (!hex) {
    issues.push(`theme missing rgb for ${name}`);
    continue;
  }
  if (!designMd.toLowerCase().includes(hex.toLowerCase())) {
    // allow design to document via rgb too
    const parts = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!parts || !themeCss.includes(parts[0])) {
      issues.push(`DESIGN.md missing hex for ${name} (${hex})`);
    } else if (!designMd.toLowerCase().includes(hex.toLowerCase()) && !designMd.includes(parts[0])) {
      issues.push(`DESIGN.md missing ${name} (${hex})`);
    }
  }
}

// tokens.json parity
const tokensPath = join(repoRoot, "data/org/default/config/design/tokens.json");
const snapPath = join(repoRoot, "docs/design/tokens-snapshot.json");
if (!existsSync(tokensPath) || !existsSync(snapPath)) {
  issues.push("tokens.json or tokens-snapshot.json missing — run: node scripts/design/sync-tokens.mjs");
} else {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  const snap = JSON.parse(readFileSync(snapPath, "utf8"));
  if (JSON.stringify(tokens) !== JSON.stringify(snap)) {
    issues.push("tokens.json !== docs/design/tokens-snapshot.json (run sync-tokens.mjs)");
  }
  const checks = [
    ["colors.light.background", light["--background"], tokens.colors?.light?.background],
    ["colors.light.brand", light["--brand"], tokens.colors?.light?.brand],
    ["colors.light.success", light["--success"], tokens.colors?.light?.success],
    ["colors.light.info", light["--info"], tokens.colors?.light?.info],
    ["colors.dark.background", dark["--background"], tokens.colors?.dark?.background],
    ["colors.dark.card", dark["--card"], tokens.colors?.dark?.card],
    ["colors.dark.success", dark["--success"], tokens.colors?.dark?.success],
    ["hex.brand", rgbToHex(light["--brand"]), tokens.hex?.brand],
    ["hex.info", rgbToHex(light["--info"]), tokens.hex?.info],
    ["hex.darkInk", rgbToHex(dark["--foreground"]), tokens.hex?.darkInk],
  ];
  for (const [path, expected, actual] of checks) {
    if (String(expected) !== String(actual)) {
      issues.push(`${path}: expected ${expected}, got ${actual}`);
    }
  }
}

// generated preview tokens must mirror theme rgb
const genPath = join(repoRoot, "docs/design/tokens.generated.css");
if (!existsSync(genPath)) {
  issues.push("docs/design/tokens.generated.css missing — run sync-tokens.mjs");
} else {
  const gen = readFileSync(genPath, "utf8");
  for (const rgb of [
    light["--background"],
    light["--brand"],
    light["--success"],
    light["--info"],
    dark["--background"],
    dark["--card"],
    dark["--success"],
    dark["--warning"],
  ]) {
    if (rgb && !gen.includes(rgb)) {
      issues.push(`tokens.generated.css missing theme value: ${rgb}`);
    }
  }
  if (!gen.includes("--pv-background: var(--background)")) {
    issues.push("tokens.generated.css missing --pv-* aliases to theme vars");
  }
}

// product styles: no hard-coded hex
const stylesDir = join(repoRoot, "web/src/styles");
for (const name of ["theme.css", "base.css", "console-polish.css", "shell.css", "overview.css", "shared.css"]) {
  // theme.css is allowed to define rgb() — skip hex check for theme
  if (name === "theme.css") continue;
  const p = join(stylesDir, name);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");
  const hexes = text.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  if (hexes.length > 0) {
    issues.push(`${name} still has hard-coded hex: ${hexes.slice(0, 5).join(", ")}`);
  }
}

// preview html parity
const preview = readFileSync(join(repoRoot, "docs/design/preview.html"), "utf8");
const previewDark = readFileSync(join(repoRoot, "docs/design/preview-dark.html"), "utf8");
const h2Light = (preview.match(/<h2>/g) || []).length;
const h2Dark = (previewDark.match(/<h2>/g) || []).length;
if (h2Light !== h2Dark || h2Light < 8) {
  issues.push(`preview section parity: light h2=${h2Light} dark h2=${h2Dark}`);
}
if (!preview.includes('href="./tokens.generated.css"') && !preview.includes("tokens.generated.css")) {
  // preview.css may import it
  const previewCss = readFileSync(join(repoRoot, "docs/design/preview.css"), "utf8");
  if (!previewCss.includes("tokens.generated.css")) {
    issues.push("preview must load tokens.generated.css (link or @import)");
  }
}

if (issues.length === 0) {
  console.log(
    `design token check passed (theme SoT, tokens.json, generated preview tokens, no product hex, preview parity).`,
  );
  process.exit(0);
}

console.error("design token check issues:\n");
for (const issue of issues) console.error(`  - ${issue}`);
if (strict) process.exit(1);
console.error("\n(report-only; pass --strict to fail CI)");
process.exit(0);
