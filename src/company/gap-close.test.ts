import type { CatalogStore } from "../catalog-store.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "../server/storage/runtime-database.ts";
import type { IRuntimePolicyStore, RuntimePolicyRecord } from "../server/storage/runtime-policy-store.ts";
import type { IRuntimeTokenStore, RuntimeTokenRecord } from "../server/storage/runtime-token-service.ts";

import { Hono } from "hono";
/**
 * Gap-close suite: P7 policy write gate, P5 logout token revoke,
 * A2/C8 audit events, C5 config export/import.
 * Drives real company routes (+ connect-app wiring for P7/P5 end-to-end).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConnectApp } from "../server/connect-app.ts";
import { CompanyAuditEventStore } from "./audit/events.ts";
import { TokenMemberBindingStore } from "./auth/token-bindings.ts";
import { defaultOrgConfigRoot } from "./org-config/layout.ts";
import { OrgConfigStore } from "./org-config/store.ts";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function loginAdmin(
  app: Hono,
  email = "admin@acme.test",
  code = "000000",
): Promise<{ token: string; memberId: string }> {
  await app.request("/api/company/auth/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const verify = await app.request("/api/company/auth/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  expect(verify.status).toBe(200);
  const body = (await verify.json()) as { token: string; member: { id: string } };
  return { token: body.token, memberId: body.member.id };
}

describe("A2/C8 audit events + C5 export/import", () => {
  it("allows ops-admin to list audit events without member session", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-gap-a2-ops-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      isOpsAdmin: async () => true,
    });

    const res = await app.request("/api/company/audit/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("rejects audit list when neither member nor ops-admin", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-gap-a2-deny-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      isOpsAdmin: async () => false,
    });

    const res = await app.request("/api/company/audit/events");
    expect(res.status).toBe(401);
  });

  it("records login and config.write events; export/import round-trips policy", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-gap-a2-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });

    const { token } = await loginAdmin(app);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const put = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ allowedActions: ["hackernews.*"], blockedActions: [] }),
    });
    expect(put.status).toBe(200);

    const eventsRes = await app.request("/api/company/audit/events", { headers: auth });
    expect(eventsRes.status).toBe(200);
    const eventsBody = (await eventsRes.json()) as {
      items: Array<{ type: string; details?: { section?: string } }>;
    };
    const types = eventsBody.items.map((e) => e.type);
    expect(types).toContain("login");
    expect(types).toContain("config.write");
    expect(eventsBody.items.some((e) => e.type === "config.write" && e.details?.section === "policy")).toBe(true);

    const exportRes = await app.request("/api/org/config/export", { headers: auth });
    expect(exportRes.status).toBe(200);
    const bundle = (await exportRes.json()) as {
      sections: { policy: { allowedActions?: string[] } };
      version: string;
    };
    expect(bundle.sections.policy.allowedActions).toEqual(["hackernews.*"]);

    // mutate policy away
    await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ allowedActions: ["none.*"] }),
    });

    const importRes = await app.request("/api/org/config/import", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ sections: bundle.sections }),
    });
    expect(importRes.status).toBe(200);
    const imported = (await importRes.json()) as { manifest: { version: string } };
    expect(imported.manifest.version).not.toBe(bundle.version);

    const snap = await app.request("/api/org/config", { headers: auth });
    const snapBody = (await snap.json()) as { config: { policy: { allowedActions: string[] } }; version: string };
    expect(snapBody.config.policy.allowedActions).toEqual(["hackernews.*"]);
    expect(snapBody.version).toBe(imported.manifest.version);

    // store-level export has no secret fields
    const store = new OrgConfigStore(defaultOrgConfigRoot(dataDir), "default");
    const storeBundle = await store.exportBundle();
    const raw = JSON.stringify(storeBundle);
    expect(raw).not.toMatch(/api[_-]?key|clientSecret|encryption/i);
  });
});

describe("P5 logout revokes member runtime tokens (route option)", () => {
  it("calls revokeMemberRuntimeTokens and unbinds; mint path still works after re-login", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-gap-p5-"));
    tempRoots.push(dataDir);
    const revoked: string[] = [];
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      createMemberRuntimeToken: async ({ name, memberId }) => {
        const tokenId = `tok-${name}-${memberId.slice(0, 4)}`;
        return { token: `oct_${tokenId}`, tokenId };
      },
      revokeMemberRuntimeTokens: async (memberId) => {
        revoked.push(memberId);
        const bindings = new TokenMemberBindingStore(dataDir);
        const ids = await bindings.listTokenIdsForMember(memberId);
        await bindings.unbindAllForMember(memberId);
        return ids.length;
      },
    });

    const { token, memberId } = await loginAdmin(app);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const created = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "cli" }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { tokenId: string };
    const bindings = new TokenMemberBindingStore(dataDir);
    await expect(bindings.resolveMemberId(createdBody.tokenId)).resolves.toBe(memberId);

    const logout = await app.request("/api/company/auth/logout", {
      method: "POST",
      headers: auth,
    });
    expect(logout.status).toBe(200);
    const logoutBody = (await logout.json()) as { revokedRuntimeTokens: number };
    expect(logoutBody.revokedRuntimeTokens).toBeGreaterThanOrEqual(1);
    expect(revoked).toContain(memberId);
    // Fresh store instance (disk SoT) — in-memory cache on earlier instance is stale after logout path
    const bindingsAfter = new TokenMemberBindingStore(dataDir);
    await expect(bindingsAfter.resolveMemberId(createdBody.tokenId)).resolves.toBeUndefined();

    // re-login + mint still works
    const again = await loginAdmin(app);
    const mint2 = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${again.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "cli2" }),
    });
    expect(mint2.status).toBe(200);
  });
});

describe("P7 companyPolicyWriteOnly + Org policy sync via createConnectApp", () => {
  it("rejects PUT /api/runtime-policy and accepts Org policy write that mirrors runtime store", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-gap-p7-"));
    tempRoots.push(dataDir);

    const tokens = new Map<string, RuntimeTokenRecord>();
    const tokenStore: IRuntimeTokenStore = {
      async add(record) {
        tokens.set(record.id, record);
      },
      async list() {
        return [...tokens.values()];
      },
      async findByHash(tokenHash) {
        return [...tokens.values()].find((t) => t.tokenHash === tokenHash);
      },
      async updatePolicy(id, policy) {
        const cur = tokens.get(id);
        if (!cur) return undefined;
        const next = { ...cur, ...policy };
        tokens.set(id, next);
        return next;
      },
      async revoke(id) {
        return tokens.delete(id);
      },
      async markUsed() {},
    };

    let policy: RuntimePolicyRecord = {
      rules: { allowedActions: [], blockedActions: [], allowedProxies: [] },
      updatedAt: new Date(0).toISOString(),
    };
    const policyStore: IRuntimePolicyStore = {
      async get() {
        return policy;
      },
      async set(next) {
        policy = next;
      },
    };

    const noop = {
      async get() {
        return undefined;
      },
      async set() {
        return undefined;
      },
      async delete() {},
      async list() {
        return [];
      },
      async add() {},
      async take() {
        return undefined;
      },
      async put() {},
      async update() {
        return true;
      },
    };

    const emptyCatalog = {
      providers: [],
      actions: [],
      providerSummariesJson: "[]",
      providerSummariesEtag: '"empty"',
      getProvider() {
        return undefined;
      },
      getAction() {
        return undefined;
      },
    } as unknown as CatalogStore;

    const providerLoader = {
      async loadActionExecutor() {
        throw new Error("not used");
      },
      async loadProxyExecutor() {
        return undefined;
      },
      async loadCredentialValidators() {
        return {};
      },
    } as unknown as IProviderLoader;

    const runtimeDatabase = {
      connectionStore: {
        ...noop,
        async set() {
          return {
            id: "x",
            revision: "r",
            service: "s",
            connectionName: "default",
            credential: { authType: "api_key", values: {} },
          };
        },
        async updateCredential() {
          return true;
        },
      },
      oauthClientConfigStore: noop,
      oauthStateStore: noop,
      runtimeTokenStore: tokenStore,
      runtimePolicyStore: policyStore,
      runLogStore: {
        async append() {},
        async list() {
          return { items: [], nextCursor: undefined };
        },
        async get() {
          return undefined;
        },
      },
      idempotencyStore: {
        async get() {
          return undefined;
        },
        async put() {},
      },
      close() {},
    } as unknown as RuntimeDatabase;

    const secretCodec = {
      encrypted: false,
      encode(value: unknown) {
        return JSON.stringify(value);
      },
      decode(value: string) {
        return JSON.parse(value);
      },
    } as unknown as ISecretCodec;

    const { app } = await createConnectApp({
      catalog: emptyCatalog,
      providerLoader,
      runtimeDatabase,
      transitFiles: {
        async create() {
          throw new Error("unused");
        },
        async get() {
          return undefined;
        },
        async delete() {},
        async cleanupExpired() {},
      },
      publicOrigin: "http://localhost:3000",
      secretCodec,
      company: {
        dataDir,
        bootstrapAdminEmail: "admin@acme.test",
        devOtp: "000000",
        productVersion: "test",
      },
      computeRuntimeAuthConfigured: false,
      compressApiResponses: false,
    });

    const blocked = await app.request("/api/runtime-policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        allowedActions: ["*"],
        blockedActions: [],
        allowedProxies: [],
      }),
    });
    expect(blocked.status).toBe(403);
    const blockedBody = (await blocked.json()) as { error: { code: string } };
    expect(blockedBody.error.code).toBe("policy_write_via_org_config");

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
    expect(verify.status).toBe(200);
    const session = ((await verify.json()) as { token: string }).token;

    const put = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ allowedActions: ["hackernews.*"], blockedActions: ["admin.*"] }),
    });
    expect(put.status).toBe(200);

    const snap = await policyStore.get();
    expect(snap.rules.allowedActions).toEqual(["hackernews.*"]);
    expect(snap.rules.blockedActions).toEqual(["admin.*"]);

    const minted = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "agent" }),
    });
    expect(minted.status).toBe(200);
    const mintBody = (await minted.json()) as { token: string; tokenId: string };
    expect(mintBody.token.startsWith("oct_")).toBe(true);
    expect(tokens.has(mintBody.tokenId)).toBe(true);

    await app.request("/api/company/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${session}` },
    });

    expect(tokens.has(mintBody.tokenId)).toBe(false);
    const bindings = new TokenMemberBindingStore(dataDir);
    await expect(bindings.resolveMemberId(mintBody.tokenId)).resolves.toBeUndefined();
  });
});

describe("CompanyAuditEventStore unit", () => {
  it("appends and lists with type filter", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-evt-"));
    tempRoots.push(dataDir);
    const store = new CompanyAuditEventStore(dataDir);
    await store.append({ type: "login", actorEmail: "a@b.c" });
    await store.append({ type: "config.write", actorEmail: "a@b.c", details: { section: "policy" } });
    const all = await store.list({ limit: 10 });
    expect(all.items).toHaveLength(2);
    expect(all.total).toBe(2);
    expect(all.hasMore).toBe(false);
    const logins = await store.list({ type: "login" });
    expect(logins.items).toHaveLength(1);
    expect(logins.items[0]!.type).toBe("login");

    // pagination: second page empty after first takes both
    const page1 = await store.list({ limit: 1, offset: 0 });
    expect(page1.items).toHaveLength(1);
    expect(page1.hasMore).toBe(true);
    const page2 = await store.list({ limit: 1, offset: 1 });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });
});

describe("TokenMemberBindingStore disk coherence (dual instance)", () => {
  it("store A sees binds written by store B after A was warmed empty", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-bind-"));
    tempRoots.push(dataDir);
    const storeA = new TokenMemberBindingStore(dataDir);
    const storeB = new TokenMemberBindingStore(dataDir);
    // Warm A with a miss (old cache bug: A would stick empty)
    await expect(storeA.resolveMemberId("missing")).resolves.toBeUndefined();
    await storeB.bind("tok-1", "member-1");
    await expect(storeA.listTokenIdsForMember("member-1")).resolves.toEqual(["tok-1"]);
    await expect(storeA.resolveMemberId("tok-1")).resolves.toBe("member-1");
  });
});

describe("P5 shared store via createConnectApp: warm resolve → bind → logout revokes", () => {
  it("after resolveRuntimeToken miss, routes bind is visible to logout revoke", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-p5-share-"));
    tempRoots.push(dataDir);

    const tokens = new Map<string, RuntimeTokenRecord>();
    const tokenStore: IRuntimeTokenStore = {
      async add(record) {
        tokens.set(record.id, record);
      },
      async list() {
        return [...tokens.values()];
      },
      async findByHash(tokenHash) {
        return [...tokens.values()].find((t) => t.tokenHash === tokenHash);
      },
      async updatePolicy(id, policy) {
        const cur = tokens.get(id);
        if (!cur) return undefined;
        const next = { ...cur, ...policy };
        tokens.set(id, next);
        return next;
      },
      async revoke(id) {
        return tokens.delete(id);
      },
      async markUsed() {},
    };

    let policy: RuntimePolicyRecord = {
      rules: { allowedActions: [], blockedActions: [], allowedProxies: [] },
      updatedAt: new Date(0).toISOString(),
    };
    const policyStore: IRuntimePolicyStore = {
      async get() {
        return policy;
      },
      async set(next) {
        policy = next;
      },
    };

    const noop = {
      async get() {
        return undefined;
      },
      async set() {
        return undefined;
      },
      async delete() {},
      async list() {
        return [];
      },
      async add() {},
      async take() {
        return undefined;
      },
      async put() {},
      async update() {
        return true;
      },
    };

    const emptyCatalog = {
      providers: [],
      actions: [],
      providerSummariesJson: "[]",
      providerSummariesEtag: '"empty"',
      getProvider() {
        return undefined;
      },
      getAction() {
        return undefined;
      },
    } as unknown as CatalogStore;

    const providerLoader = {
      async loadActionExecutor() {
        throw new Error("not used");
      },
      async loadProxyExecutor() {
        return undefined;
      },
      async loadCredentialValidators() {
        return {};
      },
    } as unknown as IProviderLoader;

    const runtimeDatabase = {
      connectionStore: {
        ...noop,
        async set() {
          return {
            id: "x",
            revision: "r",
            service: "s",
            connectionName: "default",
            credential: { authType: "api_key", values: {} },
          };
        },
        async updateCredential() {
          return true;
        },
      },
      oauthClientConfigStore: noop,
      oauthStateStore: noop,
      runtimeTokenStore: tokenStore,
      runtimePolicyStore: policyStore,
      runLogStore: {
        async append() {},
        async list() {
          return { items: [], nextCursor: undefined };
        },
        async get() {
          return undefined;
        },
      },
      idempotencyStore: {
        async get() {
          return undefined;
        },
        async put() {},
      },
      close() {},
    } as unknown as RuntimeDatabase;

    const secretCodec = {
      encrypted: false,
      encode(value: unknown) {
        return JSON.stringify(value);
      },
      decode(value: string) {
        return JSON.parse(value);
      },
    } as unknown as ISecretCodec;

    const { app } = await createConnectApp({
      catalog: emptyCatalog,
      providerLoader,
      runtimeDatabase,
      transitFiles: {
        async create() {
          throw new Error("unused");
        },
        async get() {
          return undefined;
        },
        async delete() {},
        async cleanupExpired() {},
      },
      publicOrigin: "http://localhost:3000",
      secretCodec,
      company: {
        dataDir,
        bootstrapAdminEmail: "admin@acme.test",
        devOtp: "000000",
        productVersion: "test",
      },
      computeRuntimeAuthConfigured: false,
      compressApiResponses: false,
    });

    // Warm shared store via /v1 auth path: unknown bearer still hits resolveRuntimeToken → resolveMemberId miss
    await app.request("/v1/health", {
      headers: { authorization: "Bearer oct_not_a_real_token_xxxxxxxxxxxx" },
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
    const session = ((await verify.json()) as { token: string }).token;

    // Mint through product path (createToken + bind in connect-app + bind in routes)
    const minted = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "after-warm" }),
    });
    expect(minted.status).toBe(200);
    const mintBody = (await minted.json()) as { token: string; tokenId: string };
    expect(tokens.has(mintBody.tokenId)).toBe(true);

    // Also exercise POST bind with a second token created only in store then bound via routes
    await tokenStore.add({
      id: "manual-tok-id",
      name: "manual",
      tokenHash: "deadbeef",
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      createdAt: new Date().toISOString(),
    });
    const bindRes = await app.request("/api/company/runtime-tokens/bind", {
      method: "POST",
      headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ tokenId: "manual-tok-id" }),
    });
    expect(bindRes.status).toBe(200);

    const logout = await app.request("/api/company/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${session}` },
    });
    expect(logout.status).toBe(200);
    const logoutBody = (await logout.json()) as { revokedRuntimeTokens: number };
    // Must revoke both mint + bind paths (shared store list must see both)
    expect(logoutBody.revokedRuntimeTokens).toBeGreaterThanOrEqual(2);
    expect(tokens.has(mintBody.tokenId)).toBe(false);
    expect(tokens.has("manual-tok-id")).toBe(false);

    const disk = new TokenMemberBindingStore(dataDir);
    await expect(disk.listTokenIdsForMember("any")).resolves.toEqual([]);
    await expect(disk.resolveMemberId(mintBody.tokenId)).resolves.toBeUndefined();
    await expect(disk.resolveMemberId("manual-tok-id")).resolves.toBeUndefined();
  });
});
