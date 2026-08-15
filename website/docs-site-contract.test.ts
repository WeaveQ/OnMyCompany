import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handbookAppendixItems, handbookNav } from "./.vitepress/config.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredAppendixLinks = [
  "/onmycompany/TEAM-ISOLATION",
  "/onmycompany/OMNIROUTE-SIDECAR",
  "/onmycompany/SKILLS-PLAN",
  "/onmycompany/ROADMAP",
  "/onmycompany/GATEWAY-OBSERVABILITY-PLAN",
  "/plan/OMC-DEV-PLAN",
  "/onmycompany/INIT-CHECKLIST",
];

describe("docs site contract", () => {
  it("lists every usage-guide appendix target in the VitePress sidebar", () => {
    const links = handbookAppendixItems.map((item) => item.link);
    for (const link of requiredAppendixLinks) {
      expect(links).toContain(link);
    }
  });

  it("does not publish the admin console as a localhost top-nav destination", () => {
    expect(handbookNav.some((item) => item.link.includes("127.0.0.1:5180"))).toBe(false);
    expect(handbookNav.some((item) => item.text === "控制台" && item.link === "/console")).toBe(true);
  });

  it("does not blanket-ignore onmyagent sibling paths", () => {
    const source = readFileSync(join(repoRoot, "website/.vitepress/config.mjs"), "utf8");
    expect(source).not.toMatch(/includes\(["']onmyagent["']\)/);
  });

  it("states the live grant rule and does not claim a missing header still executes", () => {
    const connections = readFileSync(join(repoRoot, "docs/user-guide/connections.md"), "utf8");
    const policy = readFileSync(join(repoRoot, "docs/user-guide/policy.md"), "utf8");
    for (const body of [connections, policy]) {
      expect(body).toMatch(/connection_team_denied/);
      expect(body).toMatch(/非空/);
      expect(body).not.toMatch(/现在仍会执行/);
      expect(body).not.toMatch(/Missing X-Team-Id still executes/i);
    }
  });

  it("does not present :3000 as the npm run dev API path", () => {
    const files = [
      "docs/user-guide/quickstart.md",
      "docs/user-guide/faq.md",
      "docs/onmycompany/BOOTSTRAP.md",
      "docs/onmycompany/INIT-CHECKLIST.md",
      "docs/onmycompany/ENV.md",
    ];
    for (const rel of files) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      expect(text).not.toMatch(/npm run dev[^\n]*:3000/);
      expect(text).not.toMatch(/localhost:3000/);
      expect(text).not.toMatch(/127\.0\.0\.1:3000/);
    }
    const init = readFileSync(join(repoRoot, "docs/onmycompany/INIT-CHECKLIST.md"), "utf8");
    expect(init).toMatch(/npm run dev.*API :3100/);
    const bootstrap = readFileSync(join(repoRoot, "docs/onmycompany/BOOTSTRAP.md"), "utf8");
    expect(bootstrap).toMatch(/127\.0\.0\.1:3100/);
    const env = readFileSync(join(repoRoot, "docs/onmycompany/ENV.md"), "utf8");
    expect(env).toMatch(/未设时进程默认 `3000`/);
    expect(env).toMatch(/npm run dev/);
  });

  it("points usage-guide OnMyAgent handbook links at published HTTPS URLs", () => {
    const index = readFileSync(join(repoRoot, "docs/user-guide/index.md"), "utf8");
    const desktop = readFileSync(join(repoRoot, "docs/user-guide/desktop.md"), "utf8");
    expect(index).toMatch(/https:\/\/weaveq\.github\.io\/OnMyAgent\/docs\/guide\/company/);
    expect(desktop).toMatch(/https:\/\/weaveq\.github\.io\/OnMyAgent\/docs\/guide\/company/);
    expect(index).not.toMatch(/\]\(\.\.\/\.\.\/\.\.\/onmyagent\//);
    expect(desktop).not.toMatch(/\]\(\.\.\/\.\.\/\.\.\/onmyagent\//);
  });

  it("runs the docs build on the PR/main CI path", () => {
    const ci = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/npm run build:docs/);
  });
});
