import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { defaultOrgConfigRoot } from "./org-config/layout.ts";
import { registerCompanyRoutes, type CompanyHealthBody } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("registerCompanyRoutes", () => {
  it("serves GET /api/company/health and ensures org layout", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-co-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, { dataDir, productVersion: "0.1.0-m0" });

    const response = await app.request("/api/company/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as CompanyHealthBody;
    expect(body.ok).toBe(true);
    expect(body.companyModule).toBe(true);
    expect(body.orgId).toBe("default");
    expect(body.orgConfigReady).toBe(true);
    expect(body.orgConfigRoot).toBe(defaultOrgConfigRoot(dataDir));
    expect(body.version).toBe("0.1.0-m0");

    const { readFile } = await import("node:fs/promises");
    const manifest = await readFile(join(body.orgConfigRoot, "manifest.json"), "utf8");
    expect(manifest).toContain("cfg-0");
  });
});
