/**
 * Audit events product surface: loadAuditEvents + query builders + export path.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  buildAuditEventsQuery,
  datePresetRange,
  exportAuditEvents,
  loadAuditEvents,
} from "./audit-events-page";

describe("loadAuditEvents", () => {
  it("calls GET /api/company/audit/events with filters and returns page meta", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url.startsWith("/api/company/audit/events")).toBe(true);
      expect(url).toContain("type=login");
      expect(url).toContain("q=signed");
      expect(url).toContain("actor=admin");
      expect(url).toContain("client=admin_console");
      expect(url).toContain("limit=50");
      expect(url).toContain("offset=0");
      return new Response(
        JSON.stringify({
          items: [
            {
              type: "login",
              actorEmail: "admin@acme.test",
              at: "2026-08-04T00:00:00.000Z",
              summary: "admin@acme.test signed in",
              client: "admin_console",
              ip: "10.0.0.1",
              details: { provider: "email" },
            },
            {
              type: "config.write",
              actorEmail: "admin@acme.test",
              at: "2026-08-04T00:01:00.000Z",
              summary: "admin@acme.test updated config (policy)",
              client: "admin_console",
              details: { section: "policy" },
            },
          ],
          total: 12,
          limit: 50,
          offset: 0,
          hasMore: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const page = await loadAuditEvents({
      type: "login",
      q: "signed",
      actor: "admin",
      client: "admin_console",
      limit: 50,
      offset: 0,
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.type).toBe("login");
    expect(page.items[0]?.summary).toContain("signed in");
    expect(page.items[0]?.ip).toBe("10.0.0.1");
    expect(page.total).toBe(12);
    expect(page.hasMore).toBe(false);
    expect(AUDIT_PAGE_SIZE).toBe(50);
  });

  it("throws ApiError on non-OK response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 403 }));
    await expect(loadAuditEvents({ fetchImpl: fetchImpl as typeof fetch })).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("buildAuditEventsQuery / datePresetRange", () => {
  it("serializes filters for the real events API", () => {
    const qs = buildAuditEventsQuery({
      type: "token",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-05T00:00:00.000Z",
      limit: 50,
      offset: 50,
    });
    expect(qs).toContain("type=token");
    expect(qs).toContain("from=2026-08-01");
    expect(qs).toContain("offset=50");
  });

  it("builds finite ranges for presets", () => {
    const today = datePresetRange("today");
    expect(today.from).toBeTruthy();
    expect(today.to).toBeTruthy();
    expect(datePresetRange("all")).toEqual({});
    const week = datePresetRange("7d");
    expect(Date.parse(week.to!) - Date.parse(week.from!)).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });
});

describe("exportAuditEvents", () => {
  it("calls export with kind=events&format=csv", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/company/audit/export");
      expect(url).toContain("kind=events");
      expect(url).toContain("format=csv");
      expect(url).toContain("type=login");
      return new Response("id,at,type\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      });
    });
    const out = await exportAuditEvents({
      format: "csv",
      type: "login",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(out.filename).toBe("audit-events.csv");
    expect(await out.blob.text()).toContain("id,at,type");
  });
});
