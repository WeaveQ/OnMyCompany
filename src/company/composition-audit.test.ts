/**
 * Composition contracts: single token bind; connection mutation audit carries IP/client.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import {
  ConnectionService,
  runWithConnectionMutationAudit,
} from "../connection-service.ts";
import { CompanyAuditEventStore } from "./audit/events.ts";
import { TokenMemberBindingStore } from "./auth/token-bindings.ts";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
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
  expect(verify.status).toBe(200);
  return ((await verify.json()) as { token: string }).token;
}

describe("composition: token bind once + connection audit meta", () => {
  it("mints runtime token with exactly one bind on the product path", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-bind-once-"));
    tempRoots.push(dataDir);
    const bindings = new TokenMemberBindingStore(dataDir);
    let bindCalls = 0;
    const origBind = bindings.bind.bind(bindings);
    bindings.bind = async (tokenId, memberId) => {
      bindCalls += 1;
      return origBind(tokenId, memberId);
    };

    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      tokenBindings: bindings,
      createMemberRuntimeToken: async ({ memberId }) => {
        const tokenId = `tok-once-${memberId.slice(0, 4)}`;
        // composition root is the single bind site (mirrors connect-app)
        await bindings.bind(tokenId, memberId);
        return { token: `oct_${tokenId}`, tokenId };
      },
    });

    const token = await loginAdmin(app);
    const mint = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "once" }),
    });
    expect(mint.status).toBe(200);
    const body = (await mint.json()) as { tokenId: string; memberId: string };
    // One bind from createMemberRuntimeToken only — route must not bind again.
    expect(bindCalls).toBe(1);
    await expect(bindings.resolveMemberId(body.tokenId)).resolves.toBe(body.memberId);

    const events = await app.request("/api/company/audit/events?type=token.create", {
      headers: { authorization: `Bearer ${token}` },
    });
    const page = (await events.json()) as { items: Array<{ details?: { tokenId?: string } }> };
    expect(page.items[0]?.details?.tokenId).toBe(body.tokenId);
  });

  it("connection mutation audit includes client/ip/actor from request ALS meta", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-conn-audit-"));
    tempRoots.push(dataDir);
    const audit = new CompanyAuditEventStore(dataDir);
    const catalog = createCatalogStore(
      [
        {
          service: "example",
          displayName: "Example",
          categories: ["Developer Tools"],
          authTypes: ["api_key"],
          auth: [{ type: "api_key" }],
          actions: [
            {
              id: "example.echo",
              service: "example",
              name: "echo",
              description: "echo",
              requiredScopes: [],
              providerPermissions: [],
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
            },
          ],
        },
      ],
      { executableActionIds: ["example.echo"] },
    );
    const storeRows = new Map<
      string,
      {
        id: string;
        revision: string;
        service: string;
        connectionName: string;
        credential: { authType: "api_key"; apiKey: string; values: Record<string, string>; profile: unknown; metadata: Record<string, unknown> };
      }
    >();
    const connections = new ConnectionService({
      catalog,
      providerLoader: {
        loadActionExecutor: async () => async () => ({ ok: true, output: {} }),
        loadProxyExecutor: async () => undefined,
        loadCredentialValidators: async () => ({}),
      },
      store: {
        async get(service, name) {
          return storeRows.get(`${service}::${name}`);
        },
        async set(service, connectionName, credential) {
          const row = {
            id: `${service}:${connectionName}`,
            revision: "r1",
            service,
            connectionName,
            credential: credential as (typeof storeRows extends Map<string, infer V> ? V : never)["credential"],
          };
          storeRows.set(`${service}::${connectionName}`, row);
          return row;
        },
        async updateCredential() {
          return true;
        },
        async delete(service, connectionName) {
          storeRows.delete(`${service}::${connectionName}`);
        },
        async list() {
          return [...storeRows.values()];
        },
      },
      onConnectionMutation: async (event) => {
        await audit.append({
          type: event.op === "create" ? "connection.create" : "connection.delete",
          client: event.client,
          ip: event.ip,
          actorEmail: event.actorEmail,
          details: { service: event.service, connectionName: event.connectionName },
        });
      },
    });

    await runWithConnectionMutationAudit(
      { client: "admin_console", ip: "198.51.100.7", actorEmail: "ops@acme.test" },
      async () => {
        await connections.connectWithApiKey("example", {
          connectionName: "default",
          values: { apiKey: "k-test-value" },
        });
      },
    );

    const items = await audit.listAll({ type: "connection.create" });
    expect(items.length).toBeGreaterThanOrEqual(1);
    const ev = items[0]!;
    expect(ev.client).toBe("admin_console");
    expect(ev.ip).toBe("198.51.100.7");
    expect(ev.actorEmail).toBe("ops@acme.test");
    expect(ev.details?.service).toBe("example");
    expect(JSON.stringify(ev)).not.toContain("k-test-value");
  });
});
