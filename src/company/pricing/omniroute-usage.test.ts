import { describe, expect, it, vi } from "vitest";
import { fetchOmnirouteLlmUsage, normalizeOmnirouteUsagePayload } from "./omniroute-usage.ts";

describe("normalizeOmnirouteUsagePayload", () => {
  it("maps OmniRoute /api/usage/history shape", () => {
    const n = normalizeOmnirouteUsagePayload({
      totalRequests: 2,
      totalPromptTokens: 100,
      totalCompletionTokens: 50,
      totalCost: 0.01,
      byProvider: { opencode: { requests: 2, promptTokens: 100, completionTokens: 50, cost: 0.01 } },
      byModel: {
        "big-pickle (opencode)": {
          requests: 2,
          promptTokens: 100,
          completionTokens: 50,
          cost: 0.01,
          provider: "opencode",
        },
      },
      byAccount: {},
      last10Minutes: [{ requests: 0 }],
    });
    expect(n.totalRequests).toBe(2);
    expect(n.totalTokens).toBe(150);
    expect(n.byProvider[0]?.key).toBe("opencode");
    expect(n.byModel[0]?.requests).toBe(2);
    expect(n.series).toEqual([{ requests: 0 }]);
  });
});

describe("fetchOmnirouteLlmUsage", () => {
  it("returns ok summary when history is reachable", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          totalRequests: 1,
          totalPromptTokens: 84,
          totalCompletionTokens: 110,
          totalCost: 0,
          byProvider: { opencode: { requests: 1, promptTokens: 84, completionTokens: 110, cost: 0 } },
          byModel: {},
          byAccount: {},
        }),
        { status: 200 },
      ),
    );
    const summary = await fetchOmnirouteLlmUsage({ fetchImpl: fetchImpl as typeof fetch });
    expect(summary.ok).toBe(true);
    expect(summary.source).toBe("omniroute");
    expect(summary.totalTokens).toBe(194);
    expect(summary.byProvider[0]?.key).toBe("opencode");
  });

  it("returns unavailable when sidecar is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const summary = await fetchOmnirouteLlmUsage({ fetchImpl: fetchImpl as typeof fetch });
    expect(summary.ok).toBe(false);
    expect(summary.source).toBe("unavailable");
    expect(summary.detail).toMatch(/ECONNREFUSED/);
  });
});
