/**
 * Gating check: company route paths from routes.ts appear in API-NOTES.md.
 * Also flags stale stage phrases in product entry docs.
 *
 * Usage: node scripts/check-docs-api-notes.mjs
 * Exit 0 on pass.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const routesSrc = read("src/company/routes.ts");
const pathRe = /app\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
/** @type {Array<{ method: string, path: string }>} */
const routes = [];
let m;
while ((m = pathRe.exec(routesSrc))) {
  routes.push({ method: m[1].toUpperCase(), path: m[2] });
}

const samplePaths = [
  "/api/company/health",
  "/api/me",
  "/api/teams",
  "/api/catalog/skills",
  "/api/company/audit/export",
];

const apiNotes = read("docs/onmycompany/API-NOTES.md");
const failures = [];

for (const p of samplePaths) {
  if (!apiNotes.includes(p)) {
    failures.push(`API-NOTES missing sample path: ${p}`);
  }
  // Must not appear only as unimplemented marker on that line
  const lines = apiNotes.split("\n").filter((l) => l.includes(p));
  if (lines.some((l) => /⏳\s*M[012]/.test(l) && !/延期|stub|MVP/.test(l))) {
    failures.push(`API-NOTES still marks shipped path as ⏳ M0/M1: ${p}`);
  }
  if (!routes.some((r) => r.path === p || r.path.startsWith(p.split("?")[0]))) {
    // allow path templates that share prefix
    const base = p.split("?")[0];
    if (
      !routes.some((r) => r.path === base || r.path.startsWith(base + "/") || base.startsWith(r.path.split(":")[0]))
    ) {
      failures.push(`routes.ts missing sample path used in docs: ${p}`);
    }
  }
}

// Every concrete (non-param) company path should be mentioned once
const concrete = routes.map((r) => r.path).filter((p) => !p.includes(":"));
for (const p of concrete) {
  if (!apiNotes.includes(p)) {
    failures.push(`API-NOTES missing route from routes.ts: ${p}`);
  }
}

const entryFiles = ["README.md", "AGENTS.md", "docs/onmycompany/README.md", "docs/Architecture.md"];
const staleRe = /脚手架待写|企业逻辑（建设中）|尚未实现|M0 only|src\/company\/.*待写/i;
for (const f of entryFiles) {
  const text = read(f);
  if (staleRe.test(text)) {
    failures.push(`stale stage claim in ${f}`);
  }
  if (f === "AGENTS.md" && /当前阶段.*\*\*M0\*\*/.test(text)) {
    failures.push("AGENTS.md still says stage M0");
  }
}

// agents/readme should mention pilot or MVP done
const agents = read("AGENTS.md");
if (!/试点|MVP 已完成|已完成/.test(agents)) {
  failures.push("AGENTS.md does not mention pilot/MVP complete status");
}

// Public-prefix claims must match COMPANY_PRODUCT_PUBLIC_* in auth.ts
const authSrc = read("src/server/api/auth.ts");
function extractStringArray(src, constName) {
  const re = new RegExp(`export const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\] as const`);
  const match = src.match(re);
  if (!match) return [];
  return [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
}
const allowPrefixes = extractStringArray(authSrc, "COMPANY_PRODUCT_PUBLIC_PREFIXES");
const exactPublic = extractStringArray(authSrc, "COMPANY_PRODUCT_PUBLIC_EXACT");

if (!allowPrefixes.includes("/api/teams")) {
  failures.push('auth.ts COMPANY_PRODUCT_PUBLIC_PREFIXES missing "/api/teams"');
}
if (!apiNotes.includes("/api/teams")) {
  failures.push("API-NOTES must document /api/teams");
}
if (allowPrefixes.length === 0) {
  failures.push("failed to parse COMPANY_PRODUCT_PUBLIC_PREFIXES from auth.ts");
}

function isBypassedByAuth(path) {
  if (exactPublic.includes(path)) return true;
  return allowPrefixes.some(
    (pref) => path === pref.replace(/\/$/, "") || path.startsWith(pref) || path.startsWith(pref.replace(/\/$/, "")),
  );
}
for (const r of routes) {
  if (!isBypassedByAuth(r.path) && !allowPrefixes.some((p) => r.path.startsWith(p.replace(/\/$/, "")))) {
    failures.push(`company route not covered by auth public prefixes: ${r.method} ${r.path}`);
  }
}

const publicTableHints = [
  "/api/company/",
  "/api/me",
  "/api/org/",
  "/api/catalog/",
  "/api/teams",
  "/api/policy/effective",
];
for (const hint of publicTableHints) {
  const covered =
    isBypassedByAuth(hint.replace(/\*$/, "x")) ||
    allowPrefixes.some((p) => hint.startsWith(p) || p.startsWith(hint.replace(/\*$/, ""))) ||
    exactPublic.some((p) => p === hint || hint.startsWith(p));
  if (!covered) {
    failures.push(`API-NOTES public-prefix hint not in auth allowlist: ${hint}`);
  }
}

if (failures.length) {
  console.error("check-docs-api-notes FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("check-docs-api-notes OK");
console.log(`  routes extracted: ${routes.length}`);
console.log(`  sample paths present: ${samplePaths.join(", ")}`);
console.log(`  concrete paths checked: ${concrete.length}`);
console.log(`  auth company prefixes: ${allowPrefixes.join(", ")}`);
