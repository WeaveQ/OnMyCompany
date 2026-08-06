/**
 * Enterprise audit productization + skill visibility + connection disable.
 * Drives real registerCompanyRoutes + stores (no reimplemented filters).
 */
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { CompanyAuditEventStore } from "./audit/events.ts";
import { ConnectionDisableStore } from "./connections/disable-store.ts";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function login(app: Hono, email: string, code = "000000"): Promise<{ token: string; memberId: string }> {
  await app.request("/api/company/auth/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const verify = await app.request("/api/company/auth/email/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "x-omc-client": "admin_console",
    },
    body: JSON.stringify({ email, code }),
  });
  expect(verify.status).toBe(200);
  const body = (await verify.json()) as { token: string; member: { id: string } };
  return { token: body.token, memberId: body.member.id };
}

describe("audit productization HTTP", () => {
  it("records summary/client/ip, filters list, exports events CSV without secrets, audits export", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-aprod-"));
    tempRoots.push(dataDir);
    const auditEvents = new CompanyAuditEventStore(dataDir);
    const tokens = new Map<string, string>();
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      auditEvents,
      createMemberRuntimeToken: async ({ name: _name, memberId }) => {
        const tokenId = `tok-${memberId.slice(0, 6)}`;
        const token = `oct_${tokenId}_SECRETVALUE`;
        tokens.set(tokenId, token);
        return { token, tokenId };
      },
    });

    const admin = await login(app, "admin@acme.test");
    const auth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const mint = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: {
        ...auth,
        "x-forwarded-for": "203.0.113.10",
        "x-omc-client": "admin_console",
      },
      body: JSON.stringify({ name: "ci" }),
    });
    expect(mint.status).toBe(200);
    const mintBody = (await mint.json()) as { token: string; tokenId: string };
    expect(mintBody.token).toContain("SECRETVALUE");

    const list = await app.request("/api/company/audit/events?type=token&q=minted", { headers: auth });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      items: Array<{ type: string; summary?: string; client?: string; ip?: string; details?: Record<string, unknown> }>;
      total: number;
    };
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    const tokenEvt = listBody.items.find((e) => e.type === "token.create");
    expect(tokenEvt?.summary?.toLowerCase()).toContain("token");
    expect(tokenEvt?.client).toBe("admin_console");
    expect(tokenEvt?.ip).toBe("203.0.113.10");
    // correlation id survives sanitize; raw secret must not
    expect(tokenEvt?.details?.tokenId).toBe(mintBody.tokenId);
    expect(JSON.stringify(listBody)).not.toContain("SECRETVALUE");

    const exportRes = await app.request("/api/company/audit/export?kind=events&format=csv&type=token", {
      headers: auth,
    });
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain("token.create");
    expect(csv).toContain("summary");
    expect(csv).not.toContain("SECRETVALUE");
    expect(csv).not.toContain(mintBody.token);

    const afterExport = await app.request("/api/company/audit/events?type=audit.export", { headers: auth });
    const exportList = (await afterExport.json()) as { items: Array<{ type: string }> };
    expect(exportList.items.some((e) => e.type === "audit.export")).toBe(true);

    // login event also carries client/ip
    const logins = await app.request("/api/company/audit/events?type=login", { headers: auth });
    const loginBody = (await logins.json()) as { items: Array<{ client?: string; ip?: string; summary?: string }> };
    expect(loginBody.items[0]?.client).toBe("admin_console");
    expect(loginBody.items[0]?.ip).toBe("203.0.113.10");
    expect(loginBody.items[0]?.summary).toBeTruthy();
  });

  it("hides org skills from members without visibleToRoles grant", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-skill-vis-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const admin = await login(app, "admin@acme.test");
    const adminAuth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const upload = await app.request("/api/org/skills/upload", {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({
        packageId: "secret-skill@1.0.0",
        name: "Secret Skill",
        skillMarkdown: "# Secret\n",
        enable: true,
      }),
    });
    expect(upload.status).toBe(200);

    const vis = await app.request("/api/org/skills/visibility", {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ packageId: "secret-skill@1.0.0", visibleToRoles: ["admin"] }),
    });
    expect(vis.status).toBe(200);

    await app.request("/api/org/members", {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ email: "member@acme.test", roles: ["member"] }),
    });
    const member = await login(app, "member@acme.test");
    const memberAuth = { authorization: `Bearer ${member.token}` };

    const asAdmin = await app.request("/api/catalog/skills?scope=org", { headers: adminAuth });
    const adminItems = (await asAdmin.json()) as { items: Array<{ packageId: string }> };
    expect(adminItems.items.some((i) => i.packageId === "secret-skill@1.0.0")).toBe(true);

    const asMember = await app.request("/api/catalog/skills?scope=org", { headers: memberAuth });
    const memberItems = (await asMember.json()) as { items: Array<{ packageId: string }> };
    expect(memberItems.items.some((i) => i.packageId === "secret-skill@1.0.0")).toBe(false);

    const events = await app.request("/api/company/audit/events?type=skills", {
      headers: adminAuth,
    });
    const evBody = (await events.json()) as { items: Array<{ type: string }> };
    expect(evBody.items.some((e) => e.type === "skills.visibility")).toBe(true);
  });

  it("connection disable API writes audit and blocks ConnectionService.resolveForExecution", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-cdis-http-"));
    tempRoots.push(dataDir);
    const connectionDisableStore = new ConnectionDisableStore(dataDir);
    const auditEvents = new CompanyAuditEventStore(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      auditEvents,
      connectionDisableStore,
    });
    const admin = await login(app, "admin@acme.test");
    const auth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const disable = await app.request("/api/company/connections/state", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ service: "hackernews", connectionName: "default", disabled: true }),
    });
    expect(disable.status).toBe(200);
    const body = (await disable.json()) as { enabled: boolean; disabled: boolean };
    expect(body.disabled).toBe(true);
    expect(body.enabled).toBe(false);

    await expect(connectionDisableStore.isDisabled("hackernews", "default")).resolves.toBe(true);

    const catalog = createCatalogStore(
      [
        {
          service: "hackernews",
          displayName: "HN",
          categories: ["Developer Tools"],
          authTypes: ["no_auth"],
          auth: [{ type: "no_auth" }],
          actions: [
            {
              id: "hackernews.get_top_stories",
              service: "hackernews",
              name: "get_top_stories",
              description: "top",
              requiredScopes: [],
              providerPermissions: [],
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
            },
          ],
        },
      ],
      { executableActionIds: ["hackernews.get_top_stories"] },
    );
    const connections = new ConnectionService({
      catalog,
      providerLoader: {
        loadActionExecutor: async () => async () => ({ ok: true, output: {} }),
        loadProxyExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
      },
      store: {
        async get() {
          return undefined;
        },
        async set() {
          throw new Error("not used");
        },
        async updateCredential() {
          return false;
        },
        async delete() {},
        async list() {
          return [];
        },
      },
      isConnectionDisabled: (service, name) => connectionDisableStore.isDisabled(service, name),
    });

    await expect(connections.resolveForExecution("hackernews", "default")).rejects.toMatchObject({
      code: "connection_disabled",
    });

    const audit = await app.request("/api/company/audit/events?type=connection.disable", { headers: auth });
    const auditBody = (await audit.json()) as { items: Array<{ type: string; summary?: string }> };
    expect(auditBody.items.some((e) => e.type === "connection.disable")).toBe(true);
  });
});
