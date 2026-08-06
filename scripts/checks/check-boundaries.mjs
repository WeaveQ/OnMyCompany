#!/usr/bin/env node
/**
 * Mechanical import/path boundaries from AGENTS iron rules:
 * 1) src/providers/** must not import from src/company/**
 * 2) src/core/** must not import from src/company/**
 *
 *   node scripts/checks/check-boundaries.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const violations = [];

const rules = [
  {
    id: "providers-no-company",
    root: join(repoRoot, "src/providers"),
    forbid: [/from\s+["'](?:\.\.\/)+company\//, /from\s+["']@?\/?.*src\/company\//, /from\s+["']\.\.\/company\//],
    message: "src/providers must not import src/company (enterprise logic stays in company/)",
  },
  {
    id: "core-no-company",
    root: join(repoRoot, "src/core"),
    forbid: [/from\s+["'](?:\.\.\/)+company\//, /from\s+["']@?\/?.*src\/company\//, /from\s+["']\.\.\/company\//],
    message: "src/core must not import src/company (keep gateway kernel free of org domain)",
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

for (const rule of rules) {
  for (const file of walk(rule.root)) {
    const text = readFileSync(file, "utf8");
    // strip block comments lightly
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const re of rule.forbid) {
      if (re.test(stripped)) {
        violations.push({
          rule: rule.id,
          file: relative(repoRoot, file),
          message: rule.message,
        });
        break;
      }
    }
  }
}

if (violations.length === 0) {
  console.log("boundary check passed (providers/core must not import company).");
  process.exit(0);
}

console.error("boundary check failed:\n");
for (const v of violations.slice(0, 40)) {
  console.error(`  [${v.rule}] ${v.file}\n    ${v.message}`);
}
if (violations.length > 40) console.error(`  … +${violations.length - 40} more`);
process.exit(1);
