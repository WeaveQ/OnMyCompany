import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "./routes.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("W6 /api/org/members", () => {
  it("lists and adds members for org-admin", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-mem-"));
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

    const list1 = await app.request("/api/org/members", { headers: auth });
    expect(list1.status).toBe(200);
    const body1 = (await list1.json()) as { items: Array<{ email: string }> };
    expect(body1.items.some((m) => m.email === "admin@acme.test")).toBe(true);

    const add = await app.request("/api/org/members", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ email: "dev@acme.test", roles: ["member"], displayName: "Dev" }),
    });
    expect(add.status).toBe(201);
    const added = (await add.json()) as {
      member: { email: string; roles: string[]; status: string; statusLabel?: string };
    };
    expect(added.member.email).toBe("dev@acme.test");
    expect(added.member.roles).toContain("member");
    // Invited accounts start pending until first login.
    expect(added.member.status).toBe("pending");
    expect(added.member.statusLabel).toBe("Pending");

    const list2 = await app.request("/api/org/members", { headers: auth });
    const body2 = (await list2.json()) as {
      items: Array<{ email: string; status: string }>;
    };
    expect(body2.items.map((m) => m.email).sort()).toEqual(["admin@acme.test", "dev@acme.test"]);
    const dev = body2.items.find((m) => m.email === "dev@acme.test");
    expect(dev?.status).toBe("pending");
    const adminRow = body2.items.find((m) => m.email === "admin@acme.test");
    expect(adminRow?.status).toBe("active");
  });
});
