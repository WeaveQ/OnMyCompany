/**
 * HTTP + store path: X-Team-Id attribution, connection team-grant deny, G3 tool-run quota.
 * Uses createConnectApp (real ActionRunner + Sqlite run log), not a reimplemented filter.
 */
import type { CatalogStore } from "../catalog-store.ts";
import type { ActionDefinition, ProviderDefinition } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { createConnectApp } from "../server/connect-app.ts";
import { PlainTextSecretCodec } from "../server/secrets/secret-codec-core.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite-runtime-store.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

const exampleProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [echoAction],
};

describe("execution guards via createConnectApp", () => {
  it("copies X-Team-Id onto the run and denies a team not granted the connection", async () => {
    const { app, dataDir } = await boot();
    const admin = await login(app, "admin@acme.test");
    const auth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const teamA = await app.request("/api/teams", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "alpha" }),
    });
    expect([200, 201]).toContain(teamA.status);
    const teamAId = ((await teamA.json()) as { team: { id: string } }).team.id;
    const teamB = await app.request("/api/teams", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "beta" }),
    });
    const teamBId = ((await teamB.json()) as { team: { id: string } }).team.id;

    const grant = await app.request("/api/company/connections/team-grants", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ service: "example", connectionName: "default", teamIds: [teamAId] }),
    });
    expect(grant.status).toBe(200);
    const listed = await app.request("/api/company/connections/team-grants", { headers: auth });
    const listedBody = (await listed.json()) as { items: Array<{ teamIds: string[] }> };
    expect(listedBody.items.some((i) => i.teamIds.includes(teamAId))).toBe(true);

    const minted = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "agent" }),
    });
    expect(minted.status).toBe(200);
    const runtime = ((await minted.json()) as { token: string }).token;
    const runAuth = { authorization: `Bearer ${runtime}`, "content-type": "application/json" };

    const denied = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { ...runAuth, "x-team-id": teamBId },
      body: JSON.stringify({ input: {} }),
    });
    expect(denied.status).toBe(403);
    const deniedBody = (await denied.json()) as { errorCode: string };
    expect(deniedBody.errorCode).toBe("connection_team_denied");

    const allowed = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { ...runAuth, "x-team-id": teamAId },
      body: JSON.stringify({ input: {} }),
    });
    expect(allowed.status).toBe(200);

    const unattributed = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: runAuth,
      body: JSON.stringify({ input: {} }),
    });
    expect(unattributed.status).toBe(403);
    const unattributedBody = (await unattributed.json()) as { errorCode: string };
    expect(unattributedBody.errorCode).toBe("connection_team_denied");

    const runs = await app.request("/api/company/runs?limit=20", { headers: auth });
    const runBody = (await runs.json()) as { items: Array<{ teamId?: string; ok: boolean; errorCode?: string }> };
    expect(runBody.items.some((r) => r.teamId === teamAId && r.ok)).toBe(true);
    expect(runBody.items.some((r) => r.teamId === teamBId && r.errorCode === "connection_team_denied")).toBe(true);
    expect(runBody.items.some((r) => !r.teamId && r.errorCode === "connection_team_denied")).toBe(true);

    const events = await app.request("/api/company/audit/events?type=connection.team_denied", { headers: auth });
    const ev = (await events.json()) as { items: Array<{ type: string }> };
    expect(ev.items.some((e) => e.type === "connection.team_denied")).toBe(true);

    const clear = await app.request("/api/company/connections/team-grants", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ service: "example", connectionName: "default", teamIds: [] }),
    });
    expect(clear.status).toBe(200);
    const open = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: runAuth,
      body: JSON.stringify({ input: {} }),
    });
    expect(open.status).toBe(200);
    void dataDir;
  });

  it("rejects a member over the tool-run daily quota and writes quota.deny", async () => {
    const { app } = await boot();
    const admin = await login(app, "admin@acme.test");
    const auth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const policy = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        allowedActions: ["*"],
        blockedActions: [],
        quota: { memberDailyRuns: 1 },
      }),
    });
    expect(policy.status).toBe(200);

    const minted = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "quota" }),
    });
    const runtime = ((await minted.json()) as { token: string }).token;
    const runAuth = { authorization: `Bearer ${runtime}`, "content-type": "application/json" };

    const first = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: runAuth,
      body: JSON.stringify({ input: {} }),
    });
    expect(first.status).toBe(200);

    const second = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: runAuth,
      body: JSON.stringify({ input: {} }),
    });
    expect(second.status).toBe(429);
    const body = (await second.json()) as { errorCode: string; message: string };
    expect(body.errorCode).toBe("quota_exceeded");
    expect(body.message.toLowerCase()).toContain("omniroute");

    const events = await app.request("/api/company/audit/events?type=quota.deny", { headers: auth });
    const ev = (await events.json()) as { items: Array<{ type: string }> };
    expect(ev.items.some((e) => e.type === "quota.deny")).toBe(true);
  });
});

async function boot(): Promise<{ app: Awaited<ReturnType<typeof createConnectApp>>["app"]; dataDir: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "omc-guard-"));
  tempRoots.push(dataDir);
  const catalog = createCatalogStore([exampleProvider], { executableActionIds: [echoAction.id] }) as CatalogStore;
  const providerLoader: IProviderLoader = {
    async loadActionExecutor() {
      return async () => ({ ok: true, output: { message: "ok" } });
    },
    async loadProxyExecutor() {
      return undefined;
    },
    async loadCredentialValidators() {
      return {};
    },
  };
  const { app } = await createConnectApp({
    catalog,
    providerLoader,
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
    company: { dataDir, bootstrapAdminEmail: "admin@acme.test", devOtp: "000000" },
    compressApiResponses: false,
  });
  return { app, dataDir };
}

async function login(
  app: Awaited<ReturnType<typeof createConnectApp>>["app"],
  email: string,
): Promise<{ token: string }> {
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
