#!/usr/bin/env node
/**
 * Gate: PR title, body (outside code fences), and commit subjects must not
 * contain CJK. Product UI stays multi-language via locales — this only enforces
 * English collaboration metadata (OMA-style).
 *
 * Usage:
 *   PR_TITLE=... PR_BODY=... PR_COMMITS=$'a\nb' node scripts/checks/pr-english.mjs
 *   node scripts/checks/pr-english.mjs --title "..." --body "..." --commits "..."
 *   node scripts/checks/pr-english.mjs --self-test
 */

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u;

export function stripCodeForEnglishGate(text) {
  const raw = typeof text === "string" ? text : "";
  return raw
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

export function findCjkMatches(text, { max = 5 } = {}) {
  const source = typeof text === "string" ? text : "";
  if (!source) return [];
  const hits = [];
  for (const match of source.matchAll(new RegExp(CJK_RE.source, `${CJK_RE.flags}g`))) {
    const index = match.index ?? 0;
    const start = Math.max(0, index - 12);
    const end = Math.min(source.length, index + match[0].length + 12);
    const snippet = source.slice(start, end).replace(/\s+/g, " ").trim();
    hits.push({ index, char: match[0], snippet });
    if (hits.length >= max) break;
  }
  return hits;
}

export function checkPrEnglish(input) {
  const title = (input.title ?? "").trim();
  const body = input.body ?? "";
  const commits = Array.isArray(input.commits)
    ? input.commits
    : typeof input.commits === "string"
      ? input.commits
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];

  const failures = [];

  if (!title) {
    failures.push({ field: "title", message: "PR title is required." });
  } else {
    const titleHits = findCjkMatches(title);
    if (titleHits.length > 0) {
      failures.push({
        field: "title",
        message: `PR title must be English (no CJK). Near: "${titleHits[0].snippet}"`,
      });
    }
  }

  const bodyPlain = stripCodeForEnglishGate(body);
  const bodyHits = findCjkMatches(bodyPlain);
  if (bodyHits.length > 0) {
    failures.push({
      field: "body",
      message: `PR description must be English outside code fences (no CJK). Near: "${bodyHits[0].snippet}"`,
    });
  }

  for (const subject of commits) {
    const hits = findCjkMatches(subject);
    if (hits.length > 0) {
      failures.push({
        field: "commit",
        message: `Commit subject must be English (no CJK): "${subject}"`,
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

function parseArgs(argv) {
  const out = {
    title: process.env.PR_TITLE,
    body: process.env.PR_BODY,
    commits: process.env.PR_COMMITS,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--title") out.title = argv[++i] ?? "";
    else if (arg === "--body") out.body = argv[++i] ?? "";
    else if (arg === "--commits") out.commits = argv[++i] ?? "";
  }
  return out;
}

function selfTest() {
  const ok = checkPrEnglish({
    title: "feat: team status filters",
    body: "See `未激活` in code fence only.\n\n```\n未激活\n```",
    commits: ["feat: add pending status"],
  });
  if (!ok.ok) throw new Error(`expected pass, got ${JSON.stringify(ok.failures)}`);
  const bad = checkPrEnglish({ title: "修复团队页", body: "ok", commits: [] });
  if (bad.ok) throw new Error("expected fail on CJK title");
  console.log("pr-english self-test ok");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    return;
  }
  const result = checkPrEnglish(args);
  if (result.ok) {
    console.log("PR English check passed.");
    process.exit(0);
  }
  console.error("PR English check failed:\n");
  for (const f of result.failures) {
    console.error(`  [${f.field}] ${f.message}`);
  }
  process.exit(1);
}

main();
