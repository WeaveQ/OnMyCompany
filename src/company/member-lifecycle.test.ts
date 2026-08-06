/**
 * Org member lifecycle: role update, deactivate, remove;
 * session + runtime-token invalidation.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { registerCompanyRoutes } from "./routes.ts";
import { TokenMemberBindingStore } from "./auth/token-bindings.ts";
import { CompanyAuthStore } from "./auth/store.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function login(
  app: Hono,
  email: string,
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

function createApp(dataDir: string, revoked: string[] = []): Hono {
  const app = new Hono();
  const bindings = new TokenMemberBindingStore(dataDir);
  registerCompanyRoutes(app, {
    dataDir,
    bootstrapAdminEmail: "admin@acme.test",
    devOtp: "000000",
    tokenBindings: bindings,
    createMemberRuntimeToken: async ({ name, memberId }) => {
      const tokenId = `tok-${name}-${memberId.slice(0, 6)}`;
      await bindings.bind(tokenId, memberId);
      return { token: `oct_${tokenId}`, tokenId };
    },
    revokeMemberRuntimeTokens: async (memberId) => {
      revoked.push(memberId);
      const ids = await bindings.listTokenIdsForMember(memberId);
      await bindings.unbindAllForMember(memberId);
      return ids.length;
    },
  });
  return app;
}

describe("org member lifecycle", () => {
  it("updates roles, deactivates with session+token revoke, and hard-removes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-member-life-"));
    tempRoots.push(dataDir);
    const revoked: string[] = [];
    const app = createApp(dataDir, revoked);

    const admin = await login(app, "admin@acme.test");
    const adminAuth = { authorization: `Bearer ${admin.token}`, "content-type": "application/json" };

    const create = await app.request("/api/org/members", {
      method: "POST",
      headers: adminAuth,
      body: JSON.stringify({ email: "user@acme.test", roles: ["member"] }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { member: { id: string } };
    const userId = created.member.id;

    // User logs in and mints a runtime token
    const user = await login(app, "user@acme.test");
    const userAuth = { authorization: `Bearer ${user.token}`, "content-type": "application/json" };
    const mint = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: userAuth,
      body: JSON.stringify({ name: "agent" }),
    });
    expect(mint.status).toBe(200);
    const mintBody = (await mint.json()) as { tokenId: string };
    const bindings = new TokenMemberBindingStore(dataDir);
    await expect(bindings.resolveMemberId(mintBody.tokenId)).resolves.toBe(userId);

    // Role + displayName update
    const rolePut = await app.request(`/api/org/members/${userId}`, {
      method: "PUT",
      headers: adminAuth,
      body: JSON.stringify({ roles: ["member", "auditor"], displayName: "User One" }),
    });
    expect(rolePut.status).toBe(200);
    const roleBody = (await rolePut.json()) as {
      member: { roles: string[]; status: string; displayName: string };
    };
    expect(roleBody.member.roles).toEqual(expect.arrayContaining(["member", "auditor"]));
    expect(roleBody.member.status).toBe("active");
    expect(roleBody.member.displayName).toBe("User One");

    // Deactivate → sessions + tokens gone
    const deact = await app.request(`/api/org/members/${userId}`, {
      method: "PUT",
      headers: adminAuth,
      body: JSON.stringify({ status: "deactivated" }),
    });
    expect(deact.status).toBe(200);
    const deactBody = (await deact.json()) as {
      member: { status: string };
      revokedRuntimeTokens: number;
    };
    expect(deactBody.member.status).toBe("deactivated");
    expect(deactBody.revokedRuntimeTokens).toBeGreaterThanOrEqual(1);
    expect(revoked).toContain(userId);

    // Old session no longer authenticates
    const meAfter = await app.request("/api/me", { headers: userAuth });
    expect(meAfter.status).toBe(200);
    const meBody = (await meAfter.json()) as { authenticated: boolean };
    expect(meBody.authenticated).toBe(false);

    // Binding cleared
    const bindingsAfter = new TokenMemberBindingStore(dataDir);
    await expect(bindingsAfter.resolveMemberId(mintBody.tokenId)).resolves.toBeUndefined();

    // Cannot login while deactivated
    await app.request("/api/company/auth/email/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@acme.test" }),
    });
    const blocked = await app.request("/api/company/auth/email/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@acme.test", code: "000000" }),
    });
    expect(blocked.status).toBe(403);

    // Admin still lists members (including deactivated)
    const list1 = await app.request("/api/org/members", { headers: adminAuth });
    expect(list1.status).toBe(200);
    const list1Body = (await list1.json()) as { items: Array<{ id: string; status: string }> };
    expect(list1Body.items.some((m) => m.id === userId && m.status === "deactivated")).toBe(true);

    // Reactivate + login works again
    const react = await app.request(`/api/org/members/${userId}`, {
      method: "PUT",
      headers: adminAuth,
      body: JSON.stringify({ status: "active" }),
    });
    expect(react.status).toBe(200);
    const user2 = await login(app, "user@acme.test");
    expect(user2.memberId).toBe(userId);

    // Hard remove
    const del = await app.request(`/api/org/members/${userId}`, {
      method: "DELETE",
      headers: adminAuth,
    });
    expect(del.status).toBe(200);

    const list2 = await app.request("/api/org/members", { headers: adminAuth });
    const list2Body = (await list2.json()) as { items: Array<{ id: string }> };
    expect(list2Body.items.some((m) => m.id === userId)).toBe(false);
    expect(list2Body.items.some((m) => m.id === admin.memberId)).toBe(true);

    // Store confirms gone
    const store = new CompanyAuthStore(dataDir);
    await expect(store.findMemberById(userId)).resolves.toBeUndefined();
  });

  it("refuses to deactivate the last org-admin", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-member-last-admin-"));
    tempRoots.push(dataDir);
    const app = createApp(dataDir);
    const admin = await login(app, "admin@acme.test");
    const res = await app.request(`/api/org/members/${admin.memberId}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${admin.token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "deactivated" }),
    });
    // Self-deactivate blocked first
    expect(res.status).toBe(403);
  });
});
