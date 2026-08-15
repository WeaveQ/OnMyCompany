/**
 * Access save must merge into the current OrgConfig policy before PUT.
 * putSection replaces policy.json wholesale — the shipped merge is what keeps quota/egress/BYOK.
 */
import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "../routes.ts";
import { mergeRuntimeRulesIntoOrgPolicy } from "./merge-runtime-into-org.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("mergeRuntimeRulesIntoOrgPolicy via OrgConfig PUT", () => {
  it("preserves quota, egress, and allowPersonalBYOK when Access saves allow/block", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-merge-pol-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const auth = await login(app);

    const seed = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({
        allowedActions: ["*"],
        blockedActions: [],
        allowPersonalBYOK: false,
        egress: { mode: "gateway_required", sensitiveKinds: ["email.send"] },
        quota: { memberDailyRuns: 7, teamMonthlyRuns: 40 },
      }),
    });
    expect(seed.status).toBe(200);

    const before = await app.request("/api/org/config", { headers: auth });
    const beforeBody = (await before.json()) as { config: { policy: Record<string, unknown> } };
    const payload = mergeRuntimeRulesIntoOrgPolicy(beforeBody.config.policy, {
      allowedActions: ["mail.*"],
      blockedActions: ["mail.delete"],
    });
    expect(payload.quota).toEqual({ memberDailyRuns: 7, teamMonthlyRuns: 40 });
    expect(payload.egress).toEqual({ mode: "gateway_required", sensitiveKinds: ["email.send"] });
    expect(payload.allowPersonalBYOK).toBe(false);

    const saved = await app.request("/api/org/config/policy", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify(payload),
    });
    expect(saved.status).toBe(200);

    const after = await app.request("/api/org/config", { headers: auth });
    const policy = ((await after.json()) as { config: { policy: Record<string, unknown> } }).config.policy;
    expect(policy.allowedActions).toEqual(["mail.*"]);
    expect(policy.blockedActions).toEqual(["mail.delete"]);
    expect(policy.allowPersonalBYOK).toBe(false);
    expect(policy.egress).toEqual({ mode: "gateway_required", sensitiveKinds: ["email.send"] });
    expect(policy.quota).toEqual({ memberDailyRuns: 7, teamMonthlyRuns: 40 });
  });
});

async function login(app: Hono): Promise<{ authorization: string; "content-type": string }> {
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
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}
