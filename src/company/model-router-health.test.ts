/**
 * modelRouter probe on GET /api/company/health (OmniRoute B+D sidecar).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllGlobals();
  delete process.env.OMC_OMNIROUTE_URL;
  delete process.env.OMC_OMNIROUTE_V1;
  delete process.env.OMC_OMNIROUTE_DASHBOARD_URL;
  delete process.env.OMC_OMNIROUTE_ENABLED;
});

describe("company health modelRouter", () => {
  it("reports reachable OmniRoute sidecar when /v1/models returns ok", async () => {
    process.env.OMC_OMNIROUTE_URL = "http://127.0.0.1:20128";
    process.env.OMC_OMNIROUTE_DASHBOARD_URL = "http://127.0.0.1:20128/dashboard";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain("/v1/models");
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );

    const dataDir = await mkdtemp(join(tmpdir(), "omc-mr-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, { dataDir, productVersion: "test" });

    const res = await app.request("/api/company/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      modelRouter: {
        enabled: boolean;
        provider: string;
        ok: boolean;
        dashboardUrl: string;
        v1Url: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.modelRouter.enabled).toBe(true);
    expect(body.modelRouter.provider).toBe("omniroute");
    expect(body.modelRouter.ok).toBe(true);
    expect(body.modelRouter.dashboardUrl).toContain("20128");
    expect(body.modelRouter.v1Url).toContain("/v1");
  });

  it("keeps company ok when sidecar is down", async () => {
    process.env.OMC_OMNIROUTE_URL = "http://127.0.0.1:20128";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const dataDir = await mkdtemp(join(tmpdir(), "omc-mr-down-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, { dataDir });

    const res = await app.request("/api/company/health");
    const body = (await res.json()) as { ok: boolean; modelRouter: { ok: boolean; detail?: string } };
    expect(body.ok).toBe(true);
    expect(body.modelRouter.ok).toBe(false);
    expect(body.modelRouter.detail).toMatch(/ECONNREFUSED|abort/i);
  });
});
