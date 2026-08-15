/**
 * P0 auth holes: Feishu stub, SMTP+dev OTP, auditor token mint, files GET.
 * Hits registerCompanyRoutes / createConnectApp from a real request start state.
 */
import type { CatalogStore } from "../catalog-store.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";

import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { createConnectApp } from "../server/connect-app.ts";
import { PlainTextSecretCodec } from "../server/secrets/secret-codec-core.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite-runtime-store.ts";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.OMC_SMTP_URL;
});

describe("P0 Feishu stub does not mint a session", () => {
  it("verify without ticket exchange returns no token that can authenticate /api/me", async () => {
    const app = await mountCompany();
    const feishu = await app.request("/api/company/auth/feishu/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openId: "ou_attacker", email: "attacker@acme.test", autoProvision: true }),
    });
    expect(feishu.status).toBe(501);
    const body = (await feishu.json()) as { token?: string; error?: { code: string } };
    expect(body.token).toBeUndefined();
    expect(body.error?.code).toBe("not_configured");

    const me = await app.request("/api/me", {
      headers: { authorization: `Bearer ${body.token ?? "omc_forged"}` },
    });
    const meBody = (await me.json()) as { authenticated?: boolean };
    expect(me.status === 401 || meBody.authenticated === false).toBe(true);
  });
});

describe("P0 SMTP OTP rejects fixed dev code", () => {
  it("after SMTP is configured, verify with the fixed dev OTP is rejected", async () => {
    process.env.OMC_SMTP_URL = "smtp://127.0.0.1:9";
    const app = await mountCompany();
    const start = await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test" }),
    });
    expect(start.status).toBe(200);
    const startBody = (await start.json()) as { devCode?: string; mail?: { sent?: boolean } };
    if (startBody.mail?.sent) {
      expect(startBody.devCode).toBeUndefined();
    }

    const verify = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@acme.test", code: "000000" }),
    });
    expect(verify.status).toBe(401);
    const verified = (await verify.json()) as { token?: string };
    expect(verified.token).toBeUndefined();
  });
});

describe("P0 auditor cannot mint or bind runtime tokens", () => {
  it("auditor session gets 403 on mint and bind", async () => {
    const app = await mountCompany();
    const admin = await login(app, "admin@acme.test");
    const adminAuth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const created = await app.request("/api/org/members", {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ email: "audit@acme.test", roles: ["auditor"], displayName: "Audit" }),
    });
    expect([200, 201]).toContain(created.status);

    await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "audit@acme.test" }),
    });
    const auditorLogin = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "audit@acme.test", code: "000000" }),
    });
    expect(auditorLogin.status).toBe(200);
    const auditorToken = ((await auditorLogin.json()) as { token: string }).token;
    const auditorAuth = { authorization: `Bearer ${auditorToken}`, "content-type": "application/json" };

    const mint = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: auditorAuth,
      body: JSON.stringify({ name: "should-fail" }),
    });
    expect(mint.status).toBe(403);

    const bind = await app.request("/api/company/runtime-tokens/bind", {
      method: "POST",
      headers: auditorAuth,
      body: JSON.stringify({ tokenId: "tok-none" }),
    });
    expect(bind.status).toBe(403);
  });
});

describe("P0 transit file GET requires auth", () => {
  it("unauthenticated GET /api/files/:fileId is not 200 when admin auth is configured", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-p0-file-"));
    tempRoots.push(dataDir);
    const { app } = await createConnectApp({
      catalog: emptyCatalog(),
      providerLoader: emptyProviderLoader(),
      runtimeDatabase: new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite")),
      transitFiles: {
        maxBytes: 1024,
        async create() {
          throw new Error("unused");
        },
        async read() {
          throw new Error("unused");
        },
        async delete() {
          return true;
        },
        async cleanupExpired() {},
      },
      publicOrigin: "http://localhost:3000",
      secretCodec: new PlainTextSecretCodec(),
      adminToken: "p0-admin-token",
      company: { dataDir, bootstrapAdminEmail: "admin@acme.test", devOtp: "000000" },
      compressApiResponses: false,
    });

    const res = await app.request("/api/files/deadbeefdeadbeefdeadbeefdeadbeef.bin");
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(401);
  });
});

async function mountCompany(): Promise<Hono> {
  const dataDir = await mkdtemp(join(tmpdir(), "omc-p0-"));
  tempRoots.push(dataDir);
  const app = new Hono();
  registerCompanyRoutes(app, {
    dataDir,
    bootstrapAdminEmail: "admin@acme.test",
    devOtp: "000000",
    createMemberRuntimeToken: async ({ name, memberId }) => ({
      token: `oct_${name}`,
      tokenId: `tok_${memberId.slice(0, 8)}`,
    }),
  });
  return app;
}

async function login(app: Hono, email: string): Promise<{ token: string }> {
  await app.request("/api/company/auth/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const verify = await app.request("/api/company/auth/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: "000000" }),
  });
  expect(verify.status).toBe(200);
  return { token: ((await verify.json()) as { token: string }).token };
}

function emptyCatalog(): CatalogStore {
  return createCatalogStore([]);
}

function emptyProviderLoader(): IProviderLoader {
  return {
    async loadActionExecutor() {
      throw new Error("not used");
    },
    async loadProxyExecutor() {
      return undefined;
    },
    async loadCredentialValidators() {
      return {};
    },
  };
}
