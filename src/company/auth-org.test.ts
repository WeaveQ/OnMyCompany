import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("company identity + OrgConfig (real routes)", () => {
  it("bootstraps admin, writes policy, round-trips GET", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-m12-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "123456",
      productVersion: "test",
    });

    const start = await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test" }),
    });
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as { devCode: string };
    expect(startBody.devCode).toBe("123456");

    const verify = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", code: "123456" }),
    });
    expect(verify.status).toBe(200);
    const verified = (await verify.json()) as {
      token: string;
      member: { roles: string[]; email: string };
    };
    expect(verified.member.roles).toContain("admin");
    expect(verified.token.startsWith("omc_")).toBe(true);
    const auth = { authorization: `Bearer ${verified.token}` };

    const me = await app.request("/api/me", { headers: auth });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { authenticated: boolean; roles: string[] };
    expect(meBody.authenticated).toBe(true);
    expect(meBody.roles).toContain("admin");

    const denied = await app.request("/api/org/config");
    expect(denied.status).toBe(401);

    const put = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        egress: { mode: "gateway_required", sensitiveKinds: ["email.send"] },
        actions: { allow: ["hackernews.*"], deny: [] },
        allowPersonalBYOK: false,
      }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { ok: boolean; manifest: { version: string } };
    expect(putBody.ok).toBe(true);
    expect(putBody.manifest.version).toMatch(/^cfg-\d+$/);
    expect(putBody.manifest.version).not.toBe("cfg-0");

    const get = await app.request("/api/org/config", { headers: auth });
    expect(get.status).toBe(200);
    const snap = (await get.json()) as {
      version: string;
      config: { policy: { allowPersonalBYOK: boolean; egress: { mode: string } } };
    };
    expect(snap.version).toBe(putBody.manifest.version);
    expect(snap.config.policy.allowPersonalBYOK).toBe(false);
    expect(snap.config.policy.egress.mode).toBe("gateway_required");

    const disk = JSON.parse(await readFile(join(dataDir, "org/default/config/policy.json"), "utf8")) as {
      allowPersonalBYOK: boolean;
    };
    expect(disk.allowPersonalBYOK).toBe(false);

    const effective = await app.request("/api/policy/effective", { headers: auth });
    expect(effective.status).toBe(200);
    const eff = (await effective.json()) as { source: string; policy: { allowPersonalBYOK: boolean } };
    expect(eff.source).toBe("org");
    expect(eff.policy.allowPersonalBYOK).toBe(false);

    // non-bootstrap user cannot self-register after first admin exists
    await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other@acme.test" }),
    });
    const other = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other@acme.test", code: "123456" }),
    });
    expect(other.status).toBe(403);
  });
});
