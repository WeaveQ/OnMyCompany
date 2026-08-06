#!/usr/bin/env node
/**
 * Map git changes to vitest slices (optional local shortcut).
 * Full merge gate remains `npm run ci`.
 *
 *   node scripts/test-affected.mjs
 *   node scripts/test-affected.mjs --base origin/main
 *   node scripts/test-affected.mjs --dry-run
 */

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "origin/main";

function gitDiffNames() {
  const tries = [
    ["diff", "--name-only", `${base}...HEAD`],
    ["diff", "--name-only", "HEAD~1"],
    ["diff", "--name-only", "HEAD"],
    ["status", "--porcelain"],
  ];
  for (const cmd of tries) {
    const r = spawnSync("git", cmd, { cwd: repoRoot, encoding: "utf8" });
    if (r.status !== 0) continue;
    const text = r.stdout || "";
    if (cmd[0] === "status") {
      const files = text
        .split("\n")
        .map((l) =>
          l
            .trim()
            .replace(/^\?\? /, "")
            .replace(/^.. /, ""),
        )
        .filter(Boolean);
      if (files.length) return files;
      continue;
    }
    const files = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (files.length) return files;
  }
  return [];
}

const files = gitDiffNames();
const slices = new Set();

if (files.length === 0) {
  console.log("test-affected: no changed files detected → npm test");
  slices.add("test");
} else {
  for (const f of files) {
    if (f.startsWith("web/") || f.startsWith("web\\")) slices.add("test:web");
    else if (f.startsWith("src/company/") || f.startsWith("src\\company\\")) slices.add("test:company");
    else if (f.startsWith("src/server/") || f.startsWith("src\\server\\")) slices.add("test:server");
    else if (f.startsWith("src/") || f.startsWith("scripts/") || f === "package.json" || f.startsWith("vitest")) {
      slices.add("test");
    }
  }
  if (slices.size === 0) slices.add("test");
  // If both slices and full test requested, prefer full once
  if (slices.has("test") && slices.size > 1) {
    slices.clear();
    slices.add("test");
  }
}

console.log(`test-affected: base=${base}`);
console.log(`  files: ${files.length || 0}`);
if (files.length && files.length <= 20) {
  for (const f of files) console.log(`    - ${f}`);
} else if (files.length > 20) {
  for (const f of files.slice(0, 15)) console.log(`    - ${f}`);
  console.log(`    … +${files.length - 15} more`);
}
console.log(`  slices: ${[...slices].join(", ")}`);

if (dryRun) process.exit(0);

let failed = false;
for (const slice of slices) {
  console.log(`\n→ npm run ${slice}`);
  const r = spawnSync("npm", ["run", slice], { cwd: repoRoot, stdio: "inherit" });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
