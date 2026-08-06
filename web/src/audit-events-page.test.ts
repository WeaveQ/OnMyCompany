/**
 * Audit events product surface: loadAuditEvents hits GET /api/company/audit/events.
 */
import { describe, expect, it, vi } from "vitest";
import { AUDIT_PAGE_SIZE, loadAuditEvents } from "./audit-events-page";

describe("loadAuditEvents", () => {
  it("calls GET /api/company/audit/events with pagination and returns page meta", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url.startsWith("/api/company/audit/events")).toBe(true);
      expect(url).toContain("type=login");
      expect(url).toContain("limit=50");
      expect(url).toContain("offset=0");
      return new Response(
        JSON.stringify({
          items: [
            {
              type: "login",
              actorEmail: "admin@acme.test",
              at: "2026-08-04T00:00:00.000Z",
              details: { provider: "email" },
            },
            {
              type: "config.write",
              actorEmail: "admin@acme.test",
              at: "2026-08-04T00:01:00.000Z",
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

    const page = await loadAuditEvents({ type: "login", limit: 50, offset: 0, fetchImpl: fetchImpl as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.type).toBe("login");
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
