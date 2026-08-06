import { describe, expect, it, vi } from "vitest";
import {
  normalizeOmniroutePricingPayload,
  resolvePricingCatalog,
} from "./omniroute-pricing.ts";
import { DEFAULT_PRICING_CATALOG } from "./catalog.ts";

describe("normalizeOmniroutePricingPayload", () => {
  it("parses openai-style data[] with nested pricing", () => {
    const rows = normalizeOmniroutePricingPayload({
      object: "list",
      data: [
        {
          id: "auto/best-coding",
          owned_by: "combo",
          pricing: { input: 0.5, output: 1.5, cache: 0.05 },
        },
        {
          id: "gpt-4o-mini",
          owned_by: "openai",
          input_price: 0.15,
          output_price: 0.6,
        },
      ],
    });
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      model: "auto/best-coding",
      channel: "combo",
      inputPrice: 0.5,
      outputPrice: 1.5,
      cachePrice: 0.05,
    });
    expect(rows[1]?.model).toBe("gpt-4o-mini");
  });

  it("parses models[] and free tiers as zero", () => {
    const rows = normalizeOmniroutePricingPayload({
      models: [{ id: "pollinations/free", provider: "free", free: true }],
    });
    expect(rows).toEqual([
      expect.objectContaining({
        model: "pollinations/free",
        inputPrice: 0,
        outputPrice: 0,
      }),
    ]);
  });

  it("accepts already-normalized llm[]", () => {
    const rows = normalizeOmniroutePricingPayload({
      llm: [{ channel: "x", model: "y", inputPrice: 1, cachePrice: 0, outputPrice: 2 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe("y");
  });

  it("parses OmniRoute nested provider→model map", () => {
    const rows = normalizeOmniroutePricingPayload({
      cc: {
        "claude-sonnet-4-6": { input: 3, output: 15, cached: 0.3 },
      },
      cx: {
        "gpt-5.6-sol": { input: 5, output: 30, cached: 0.5 },
      },
    });
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.model === "claude-sonnet-4-6")).toMatchObject({
      channel: "cc",
      inputPrice: 3,
      outputPrice: 15,
      cachePrice: 0.3,
    });
    expect(rows.find((r) => r.model === "gpt-5.6-sol")?.channel).toBe("cx");
  });
});

describe("resolvePricingCatalog", () => {
  const local = structuredClone(DEFAULT_PRICING_CATALOG);

  it("source=static never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const catalog = await resolvePricingCatalog({
      dataDir: "/tmp",
      mode: "static",
      fetchImpl: fetchImpl as typeof fetch,
      loadLocal: async () => local,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(catalog.source).toBe("static");
    expect(catalog.llm.length).toBeGreaterThan(0);
    expect(catalog.tools).toEqual(local.tools);
  });

  it("auto uses OmniRoute llm rows when fetch succeeds", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "auto/best-chat", owned_by: "combo", pricing: { input: 0.1, output: 0.2 } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const catalog = await resolvePricingCatalog({
      dataDir: "/tmp",
      mode: "auto",
      fetchImpl: fetchImpl as typeof fetch,
      loadLocal: async () => local,
    });
    expect(catalog.source).toBe("mixed");
    expect(catalog.llm).toEqual([
      expect.objectContaining({ model: "auto/best-chat", inputPrice: 0.1, outputPrice: 0.2 }),
    ]);
    expect(catalog.tools).toEqual(local.tools);
    expect(catalog.omniroute?.ok).toBe(true);
    expect(catalog.note).toMatch(/OmniRoute/);
  });

  it("auto falls back to static llm when OmniRoute is down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const catalog = await resolvePricingCatalog({
      dataDir: "/tmp",
      mode: "auto",
      fetchImpl: fetchImpl as typeof fetch,
      loadLocal: async () => local,
    });
    expect(catalog.source).toBe("static");
    expect(catalog.llm).toEqual(local.llm);
    expect(catalog.omniroute?.ok).toBe(false);
    expect(catalog.note).toMatch(/不可用|ECONNREFUSED/);
  });
});
