/**
 * Skill detail body + MCP/tools projection + named-config expand on export.
 * Drives registerCompanyRoutes and OrgConfigStore (same functions the app uses).
 */
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "../routes.ts";
import { CONFIG_REF_REDACTED } from "./expand.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("skill catalog detail", () => {
  it("returns SKILL.md plus version and added-by after enable", async () => {
    const { app, auth } = await mount();
    const enable = await app.request("/api/org/skills/enable", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packageId: "omc-hello@1.0.0" }),
    });
    expect(enable.status).toBe(200);

    const me = await app.request("/api/me", { headers: auth });
    const memberId = ((await me.json()) as { memberId: string }).memberId;

    const detail = await app.request("/api/catalog/skills/omc-hello@1.0.0", { headers: auth });
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      skillMd?: string;
      meta: { packageId: string; version?: string; enabledBy?: string };
    };
    expect(body.skillMd).toMatch(/Hello Team/i);
    expect(body.meta.packageId).toBe("omc-hello@1.0.0");
    expect(body.meta.version).toBe("1.0.0");
    expect(body.meta.enabledBy).toBe(memberId);
  });
});

describe("tools projection and config-ref expand", () => {
  it("lists MCP/gateway declarations and expands aliases without leaking secrets", async () => {
    const { app, auth } = await mount();
    const leaked = "sk-leaked-secret-value-do-not-export";
    const put = await app.request("/api/org/config/tools", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        mcp: {
          servers: [
            {
              name: "github-mcp",
              command: "npx",
              env: { TOKEN: "@config:GH/apiKey", LABEL: "@config:GH/service" },
            },
          ],
        },
        gateway: { services: ["github", { service: "gmail" }] },
        aliases: { GH: { service: "github", apiKey: leaked, connectionName: "default" } },
      }),
    });
    expect(put.status).toBe(200);

    const tools = await app.request("/api/org/tools", { headers: auth });
    expect(tools.status).toBe(200);
    const proj = (await tools.json()) as {
      mcp: { servers: Array<{ name: string; env?: Record<string, string> }> };
      gateway: { services: unknown[] };
      aliases: Array<{ alias: string; fields: string[] }>;
    };
    expect(proj.mcp.servers[0]?.name).toBe("github-mcp");
    expect(proj.mcp.servers[0]?.env?.LABEL).toBe("github");
    expect(proj.mcp.servers[0]?.env?.TOKEN).toBe(CONFIG_REF_REDACTED);
    expect(JSON.stringify(proj)).not.toContain(leaked);
    expect(proj.gateway.services.length).toBe(2);
    expect(proj.aliases.some((a) => a.alias === "GH" && a.fields.includes("service"))).toBe(true);
    expect(proj.aliases.some((a) => a.fields.includes("apiKey"))).toBe(false);

    const exported = await app.request("/api/org/config/export", { headers: auth });
    expect(exported.status).toBe(200);
    const bundleText = await exported.text();
    expect(bundleText).not.toContain(leaked);
    expect(bundleText).toContain(CONFIG_REF_REDACTED);
    expect(bundleText).toContain("github-mcp");
    const bundle = JSON.parse(bundleText) as {
      sections: { tools: { mcp: { servers: Array<{ env?: Record<string, string> }> } } };
    };
    expect(bundle.sections.tools.mcp.servers[0]?.env?.LABEL).toBe("github");
  });
});

async function mount(): Promise<{
  app: Hono;
  auth: { authorization: string; "content-type": string };
}> {
  const dataDir = await mkdtemp(join(tmpdir(), "omc-r3-"));
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
  expect(verify.status).toBe(200);
  const token = ((await verify.json()) as { token: string }).token;
  return { app, auth: { authorization: `Bearer ${token}`, "content-type": "application/json" } };
}
