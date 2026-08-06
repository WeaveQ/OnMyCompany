import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "../routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function loginAdmin(app: Hono): Promise<string> {
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
  const body = (await verify.json()) as { token: string };
  return body.token;
}

describe("skills S1–S3 routes", () => {
  it("lists public packages, enables to org, uploads, disables", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-sk-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const token = await loginAdmin(app);
    const auth = { authorization: `Bearer ${token}` };

    const pub = await app.request("/api/catalog/skills?scope=public", { headers: auth });
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as { items: Array<{ packageId: string; added: boolean }> };
    expect(pubBody.items.length).toBeGreaterThanOrEqual(3);
    const target = pubBody.items.find((i) => i.packageId === "omc-hello@1.0.0");
    expect(target).toBeTruthy();
    expect(target!.added).toBe(false);

    const enable = await app.request("/api/org/skills/enable", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ packageId: "omc-hello@1.0.0" }),
    });
    expect(enable.status).toBe(200);

    const org = await app.request("/api/catalog/skills?scope=org", { headers: auth });
    const orgBody = (await org.json()) as { items: Array<{ packageId: string; added: boolean }> };
    expect(orgBody.items.some((i) => i.packageId === "omc-hello@1.0.0" && i.added)).toBe(true);

    const pub2 = await app.request("/api/catalog/skills?scope=public", { headers: auth });
    const pub2Body = (await pub2.json()) as { items: Array<{ packageId: string; added: boolean }> };
    expect(pub2Body.items.find((i) => i.packageId === "omc-hello@1.0.0")!.added).toBe(true);

    const upload = await app.request("/api/org/skills/upload", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        packageId: "team-custom@0.1.0",
        name: "Team Custom",
        skillMarkdown: "# Team Custom\n\nUploaded in test.\n",
        scope: "public",
        enable: true,
      }),
    });
    expect(upload.status).toBe(200);

    const disable = await app.request("/api/org/skills/disable", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ packageId: "omc-hello@1.0.0" }),
    });
    expect(disable.status).toBe(200);
    const org2 = await app.request("/api/catalog/skills?scope=org", { headers: auth });
    const org2Body = (await org2.json()) as { items: Array<{ packageId: string }> };
    expect(org2Body.items.some((i) => i.packageId === "omc-hello@1.0.0")).toBe(false);
  });
});
