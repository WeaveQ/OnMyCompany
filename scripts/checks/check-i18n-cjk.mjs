#!/usr/bin/env node
/**
 * Freeze hard-coded CJK in web/src (OMA-style ratchet).
 * New CJK must go through locales (en as source of truth + zh-CN/zh-TW).
 *
 *   node scripts/checks/check-i18n-cjk.mjs           # enforce
 *   node scripts/checks/check-i18n-cjk.mjs --write   # regenerate baseline
 *   node scripts/checks/check-i18n-cjk.mjs --list
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const baselinePath = join(repoRoot, "scripts/checks/baselines/i18n-cjk-hardcoded.json");
const scanRoots = ["web/src"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredDirs = new Set([".git", "dist", "node_modules", "locales"]);
// Locale files + pure helpers that still accept legacy Chinese API tokens for parse.
const fileAllowlist = new Set(["web/src/locales/zh-CN.json", "web/src/locales/zh-TW.json", "web/src/locales/en.json"]);

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const args = new Set(process.argv.slice(2));
const mode = args.has("--write") ? "write" : args.has("--list") ? "list" : "enforce";

const findings = [];
for (const root of scanRoots) {
  scanDirectory(join(repoRoot, root));
}
findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

if (mode === "list") {
  for (const f of findings) console.log(`${f.file}:${f.line} ${f.excerpt}`);
  console.log(`\n${findings.length} finding(s)`);
  process.exit(0);
}

const currentCounts = countByKey(findings);

if (mode === "write") {
  const sortedEntries = Object.fromEntries(
    [...currentCounts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const payload = {
    description:
      "Frozen CJK hard-coded string occurrences in web/src. Only shrink; regenerate with --write after reducing CJK.",
    generatedAt: new Date().toISOString(),
    entries: sortedEntries,
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
  const total = [...currentCounts.values()].reduce((s, n) => s + n, 0);
  console.log(
    `Wrote baseline with ${currentCounts.size} key(s) / ${total} occurrence(s) -> ${relative(repoRoot, baselinePath)}`,
  );
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(`Missing baseline at ${relative(repoRoot, baselinePath)}. Run with --write first.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineCounts = new Map(Object.entries(baseline.entries ?? {}));

const overages = [];
for (const [key, count] of currentCounts) {
  const allowed = baselineCounts.get(key) ?? 0;
  if (count > allowed) overages.push({ key, count, allowed });
}

if (overages.length === 0) {
  const total = [...currentCounts.values()].reduce((s, n) => s + n, 0);
  console.log(`i18n CJK hard-coded check passed (${total} occurrence(s) across ${currentCounts.size} key(s)).`);
  process.exit(0);
}

console.error("New hard-coded CJK strings found (use English source + locales):\n");
for (const o of overages.slice(0, 40)) {
  console.error(`  +${o.count - o.allowed}  ${o.key}  (allowed ${o.allowed}, now ${o.count})`);
}
if (overages.length > 40) console.error(`  … and ${overages.length - 40} more`);
process.exit(1);

function scanDirectory(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (ignoredDirs.has(name)) continue;
      scanDirectory(full);
      continue;
    }
    if (!sourceExtensions.has(extname(name))) continue;
    const rel = relative(repoRoot, full).split("\\").join("/");
    if (fileAllowlist.has(rel)) continue;
    scanFile(full, rel);
  }
}

function scanFile(full, rel) {
  const text = readFileSync(full, "utf8");
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.includes("/*") && !line.includes("*/")) {
      inBlock = true;
      continue;
    }
    // strip // comments
    const hash = line.indexOf("//");
    if (hash >= 0) line = line.slice(0, hash);
    if (!CJK_RE.test(line)) continue;
    // skip import paths
    if (/^\s*import\s/.test(line)) continue;
    const excerpt = line.trim().slice(0, 120);
    findings.push({ file: rel, line: i + 1, excerpt });
  }
}

function countByKey(list) {
  const map = new Map();
  for (const f of list) {
    const key = `${f.file}::${f.excerpt}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
