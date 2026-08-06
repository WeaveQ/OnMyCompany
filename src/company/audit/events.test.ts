import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CompanyAuditEventStore,
  eventsToCsv,
  eventsToJsonl,
  filterAuditEvents,
  resolveAuditClient,
  resolveClientIp,
  sanitizeAuditDetails,
} from "./events.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("CompanyAuditEventStore product fields", () => {
  it("stores summary/client/ip and filters by from/to/q/actor/client", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-audit-"));
    tempRoots.push(dataDir);
    const store = new CompanyAuditEventStore(dataDir);

    const t0 = "2026-08-01T10:00:00.000Z";
    const t1 = "2026-08-02T12:00:00.000Z";
    const t2 = "2026-08-03T14:00:00.000Z";

    // inject times via sequential append then re-read/filter uses `at` from append (now).
    // Use filter on type/client/actor/q for real store path; time filter tested via filterAuditEvents unit.
    await store.append({
      type: "login",
      actorEmail: "admin@company.internal",
      client: "admin_console",
      ip: "10.0.0.1",
      summary: "admin@company.internal signed in",
    });
    await store.append({
      type: "token.create",
      actorEmail: "admin@company.internal",
      client: "api",
      ip: "10.0.0.2",
      details: { tokenId: "tok-1", secret: "super-secret-value", apiKey: "sk-abc" },
    });
    await store.append({
      type: "policy.deny",
      actorEmail: "user@company.internal",
      client: "mcp",
      result: "denied",
      details: { actionId: "github.delete_repo" },
    });

    const all = await store.list({ limit: 50 });
    expect(all.total).toBe(3);
    expect(all.items[0]?.type).toBe("policy.deny");
    expect(all.items.some((e) => e.summary?.includes("signed in"))).toBe(true);
    const tokenEvt = all.items.find((e) => e.type === "token.create");
    expect(tokenEvt?.details?.secret).toBe("[redacted]");
    expect(tokenEvt?.details?.apiKey).toBe("[redacted]");
    // correlation id kept
    expect(tokenEvt?.details?.tokenId).toBe("tok-1");

    const byClient = await store.list({ client: "api" });
    expect(byClient.items).toHaveLength(1);
    expect(byClient.items[0]?.type).toBe("token.create");

    const byActor = await store.list({ actor: "user@company" });
    expect(byActor.items).toHaveLength(1);
    expect(byActor.items[0]?.type).toBe("policy.deny");

    const byQ = await store.list({ q: "delete_repo" });
    expect(byQ.items).toHaveLength(1);

    const byTypePrefix = await store.list({ type: "token" });
    expect(byTypePrefix.items.map((e) => e.type)).toEqual(["token.create"]);

    // time filter helper on fixed events
    const timed = filterAuditEvents(
      [
        { id: "1", type: "login", at: t0, summary: "a" },
        { id: "2", type: "login", at: t1, summary: "b" },
        { id: "3", type: "login", at: t2, summary: "c" },
      ],
      { from: "2026-08-02T00:00:00.000Z", to: "2026-08-03T00:00:00.000Z" },
    );
    expect(timed.map((e) => e.id)).toEqual(["2"]);
  });

  it("exports CSV/JSONL without secrets", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-audit-exp-"));
    tempRoots.push(dataDir);
    const store = new CompanyAuditEventStore(dataDir);
    await store.append({
      type: "connection.create",
      actorEmail: "admin@x.test",
      client: "admin_console",
      details: {
        service: "github",
        connectionName: "default",
        token: "oct_should_not_export",
        password: "hunter2",
      },
    });
    const events = await store.listAll();
    const csv = eventsToCsv(events);
    const jsonl = eventsToJsonl(events);
    expect(csv).toContain("connection.create");
    expect(csv).toContain("summary");
    expect(csv).not.toContain("oct_should_not_export");
    expect(csv).not.toContain("hunter2");
    expect(jsonl).not.toContain("oct_should_not_export");
    expect(jsonl).toContain("[redacted]");
  });
});

describe("audit helpers", () => {
  it("resolves client and ip", () => {
    expect(resolveAuditClient({ headerClient: "desktop" })).toBe("desktop");
    expect(resolveAuditClient({ userAgent: "OnMyAgent/1.0 Electron" })).toBe("desktop");
    expect(resolveAuditClient({ pathHint: "/mcp" })).toBe("mcp");
    expect(resolveClientIp({ xForwardedFor: "1.2.3.4, 5.6.7.8" })).toBe("1.2.3.4");
    expect(resolveClientIp({ xRealIp: "9.9.9.9" })).toBe("9.9.9.9");
  });

  it("sanitizes nested secrets", () => {
    const cleaned = sanitizeAuditDetails({
      service: "gmail",
      nested: { access_token: "abc", ok: true },
      credential: { apiKey: "x" },
    });
    expect(cleaned.service).toBe("gmail");
    expect((cleaned.nested as { access_token: string }).access_token).toBe("[redacted]");
    expect(cleaned.credential).toBe("[redacted]");
  });

  it("keeps correlation ids but redacts secret keys and secret-shaped values", () => {
    const cleaned = sanitizeAuditDetails({
      tokenId: "tok-abc123",
      runtimeTokenId: "rt-xyz",
      memberId: "mem-1",
      packageId: "skill@1.0.0",
      token: "oct_should_hide_this_value",
      password: "hunter2",
      apiKey: "sk-live-not-for-export",
      name: "ci",
      leaked: "oct_runtime_secret_value_xx",
    });
    expect(cleaned.tokenId).toBe("tok-abc123");
    expect(cleaned.runtimeTokenId).toBe("rt-xyz");
    expect(cleaned.memberId).toBe("mem-1");
    expect(cleaned.packageId).toBe("skill@1.0.0");
    expect(cleaned.name).toBe("ci");
    expect(cleaned.token).toBe("[redacted]");
    expect(cleaned.password).toBe("[redacted]");
    expect(cleaned.apiKey).toBe("[redacted]");
    expect(cleaned.leaked).toBe("[redacted]");
  });
});
