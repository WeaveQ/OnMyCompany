import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { registerCompanyRoutes } from "./routes.ts";
import { TokenMemberBindingStore } from "./auth/token-bindings.ts";
import { orgPolicyToRuntimeRules } from "./policy/org-to-runtime.ts";

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
  return ((await verify.json()) as { token: string }).token;
}

describe("M3 policy sync + token binding", () => {
  it("onOrgPolicyWrite receives org policy body", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-m3-"));
    tempRoots.push(dataDir);
    const written: Record<string, unknown>[] = [];
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      onOrgPolicyWrite: (policy) => {
        written.push(policy);
      },
    });
    const token = await loginAdmin(app);
    const put = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ allowedActions: ["mail.*"], blockedActions: ["mail.delete"] }),
    });
    expect(put.status).toBe(200);
    expect(written).toHaveLength(1);
    expect(orgPolicyToRuntimeRules(written[0]!).allowedActions).toEqual(["mail.*"]);
  });

  it("mints member runtime token and binds memberId", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-m3t-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    const tokens: Array<{ name: string; memberId: string }> = [];
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      createMemberRuntimeToken: async ({ name, memberId }) => {
        tokens.push({ name, memberId });
        return { token: "oct_test_token", tokenId: "tok-1" };
      },
    });
    const session = await loginAdmin(app);
    const me = await app.request("/api/me", { headers: { authorization: `Bearer ${session}` } });
    const meBody = (await me.json()) as { memberId: string };
    const created = await app.request("/api/company/runtime-tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "desktop" }),
    });
    expect(created.status).toBe(200);
    const body = (await created.json()) as { tokenId: string; memberId: string; token: string };
    expect(body.tokenId).toBe("tok-1");
    expect(body.memberId).toBe(meBody.memberId);
    expect(tokens[0]?.memberId).toBe(meBody.memberId);

    const bindings = new TokenMemberBindingStore(dataDir);
    await expect(bindings.resolveMemberId("tok-1")).resolves.toBe(meBody.memberId);
  });
});
