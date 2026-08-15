import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OrgConfigStore } from "../org-config/store.ts";
import { registerCompanyRoutes } from "../routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("experts enable/disable", () => {
  it("keeps GET /api/org/config experts.installed isomorphic with experts/installed", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-exp-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test" }),
    });
    const verify = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", code: "000000" }),
    });
    const token = ((await verify.json()) as { token: string }).token;
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const available = await app.request("/api/catalog/experts?scope=available", { headers: auth });
    const availBody = (await available.json()) as { items: Array<{ packageId: string; installed: boolean }> };
    const pack = availBody.items[0];
    expect(pack?.packageId).toBeTruthy();

    const enable = await app.request("/api/org/experts/enable", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packageId: pack!.packageId }),
    });
    expect(enable.status).toBe(200);

    const snap = await app.request("/api/org/config", { headers: auth });
    const snapBody = (await snap.json()) as { config: { experts: { installed: string[] } } };
    expect(snapBody.config.experts.installed).toContain(pack!.packageId);

    const orgStore = new OrgConfigStore(join(dataDir, "org", "default", "config"));
    const disk = await orgStore.getSnapshot();
    expect((disk.config.experts as { installed: string[] }).installed).toContain(pack!.packageId);

    const disable = await app.request("/api/org/experts/disable", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packageId: pack!.packageId }),
    });
    expect(disable.status).toBe(200);
    const snap2 = await app.request("/api/org/config", { headers: auth });
    const snap2Body = (await snap2.json()) as { config: { experts: { installed: string[] } } };
    expect(snap2Body.config.experts.installed).not.toContain(pack!.packageId);
  });
});
