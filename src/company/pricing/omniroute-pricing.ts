/**
 * B: Pull LLM reference prices from OmniRoute sidecar; tools stay local.
 * Failures fall back to static DEFAULT_PRICING_CATALOG / pricing.json.
 */
import {
  DEFAULT_PRICING_CATALOG,
  mergePricingCatalog,
  type LlmPriceRow,
  type PricingCatalog,
} from "./catalog.ts";

export type PricingSource = "omniroute" | "static" | "mixed";

export interface PricingCatalogResponse extends PricingCatalog {
  /** Where LLM rows came from */
  source: PricingSource;
  /** Requested mode: auto | omniroute | static */
  mode: "auto" | "omniroute" | "static";
  omniroute?: {
    baseUrl: string;
    pricingPath: string;
    ok: boolean;
    detail?: string;
    fetchedAt?: string;
    rowCount?: number;
  };
}

export interface ResolvePricingInput {
  dataDir: string;
  /** auto (default) | omniroute | static */
  mode?: string | null;
  /** Injected for tests */
  fetchImpl?: typeof fetch;
  /** Injected local catalog loader */
  loadLocal?: () => Promise<PricingCatalog>;
}

function omniBaseUrl(): string {
  return (
    process.env.OMC_OMNIROUTE_URL?.trim() ||
    process.env.OMC_MODEL_ROUTER_URL?.trim() ||
    "http://127.0.0.1:20128"
  ).replace(/\/+$/, "");
}

function omniPricingPath(): string {
  const raw = process.env.OMC_OMNIROUTE_PRICING_PATH?.trim() || "/api/pricing";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function omniAdminKey(): string | undefined {
  return (
    process.env.OMC_OMNIROUTE_ADMIN_KEY?.trim() ||
    process.env.OMC_OMNIROUTE_API_KEY?.trim() ||
    undefined
  );
}

function pricingDisabled(): boolean {
  const v = process.env.OMC_OMNIROUTE_PRICING?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

/**
 * Normalize heterogeneous OmniRoute / OpenAI-adjacent pricing payloads into LlmPriceRow[].
 */
export function normalizeOmniroutePricingPayload(payload: unknown): LlmPriceRow[] {
  if (payload == null) return [];

  // Already our shape
  if (typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.llm)) {
      return obj.llm.map(rowFromUnknown).filter((r): r is LlmPriceRow => r != null);
    }
  }

  const candidates = extractCandidateArrays(payload);
  const rows: LlmPriceRow[] = [];
  const seen = new Set<string>();

  for (const list of candidates) {
    for (const item of list) {
      const row = rowFromUnknown(item);
      if (!row) continue;
      const key = `${row.channel}::${row.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function extractCandidateArrays(payload: unknown): unknown[][] {
  if (Array.isArray(payload)) return [payload];
  if (typeof payload !== "object" || payload === null) return [];
  const obj = payload as Record<string, unknown>;
  const keys = [
    "data",
    "models",
    "pricing",
    "items",
    "results",
    "prices",
    "catalog",
    "entries",
  ];
  const out: unknown[][] = [];
  for (const k of keys) {
    if (Array.isArray(obj[k])) out.push(obj[k] as unknown[]);
  }
  // nested { data: { models: [] } }
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const d = obj.data as Record<string, unknown>;
    for (const k of keys) {
      if (Array.isArray(d[k])) out.push(d[k] as unknown[]);
    }
  }

  // OmniRoute live shape: { "cc": { "claude-sonnet-4-6": { input, output, cached } }, "cx": { ... } }
  const nestedMapRows: unknown[] = [];
  for (const [channel, models] of Object.entries(obj)) {
    if (keys.includes(channel) || channel === "object" || channel === "updatedAt" || channel === "llm") {
      continue;
    }
    if (typeof models !== "object" || models == null || Array.isArray(models)) continue;
    const modelMap = models as Record<string, unknown>;
    // Heuristic: values look like price objects (have input/output) or nested model maps
    let priceLike = 0;
    for (const [modelId, price] of Object.entries(modelMap)) {
      if (typeof price !== "object" || price == null || Array.isArray(price)) continue;
      const p = price as Record<string, unknown>;
      if (
        "input" in p ||
        "output" in p ||
        "inputPrice" in p ||
        "input_price" in p ||
        "cached" in p
      ) {
        nestedMapRows.push({
          id: modelId,
          model: modelId,
          channel,
          provider: channel,
          owned_by: channel,
          ...p,
          // prefer nested fields for firstNumber
          inputPrice: p.input ?? p.inputPrice,
          outputPrice: p.output ?? p.outputPrice,
          cachePrice: p.cached ?? p.cache ?? p.cachePrice,
        });
        priceLike += 1;
      }
    }
    void priceLike;
  }
  if (nestedMapRows.length > 0) out.push(nestedMapRows);

  // map of modelId -> price object (flat)
  if (out.length === 0) {
    const values = Object.entries(obj)
      .filter(([k, v]) => k !== "object" && k !== "updatedAt" && typeof v === "object" && v != null)
      .map(([id, v]) =>
        typeof v === "object" && v != null && !Array.isArray(v)
          ? { id, ...(v as object) }
          : null,
      )
      .filter(Boolean);
    if (values.length > 0) out.push(values);
  }
  return out;
}

function rowFromUnknown(item: unknown): LlmPriceRow | null {
  if (typeof item !== "object" || item == null || Array.isArray(item)) return null;
  const r = item as Record<string, unknown>;

  const model = firstString(r, [
    "model",
    "id",
    "modelId",
    "model_id",
    "name",
    "slug",
    "root",
  ]);
  if (!model) return null;

  const channel = firstString(r, [
    "channel",
    "provider",
    "owned_by",
    "vendor",
    "source",
    "family",
  ]) || "omniroute";

  const pricing =
    (typeof r.pricing === "object" && r.pricing != null ? (r.pricing as Record<string, unknown>) : null) ||
    (typeof r.price === "object" && r.price != null ? (r.price as Record<string, unknown>) : null) ||
    (typeof r.costs === "object" && r.costs != null ? (r.costs as Record<string, unknown>) : null) ||
    r;

  const inputPrice = firstNumber(pricing, [
    "inputPrice",
    "input",
    "input_price",
    "prompt",
    "prompt_price",
    "inputPerMTok",
    "input_per_mtok",
    "input_cost_per_mtok",
    "inputCostPerMillion",
    "prompt_cost_per_mtoken",
    "cost_input",
  ]);
  const outputPrice = firstNumber(pricing, [
    "outputPrice",
    "output",
    "output_price",
    "completion",
    "completion_price",
    "outputPerMTok",
    "output_per_mtok",
    "output_cost_per_mtok",
    "outputCostPerMillion",
    "completion_cost_per_mtoken",
    "cost_output",
  ]);
  const cachePrice = firstNumber(pricing, [
    "cachePrice",
    "cache",
    "cache_price",
    "cached",
    "cached_input",
    "input_cache",
    "cache_read",
    "cacheRead",
    "cache_creation",
  ]);

  // Skip rows with no usable price signals (may be free-tier catalog without rates)
  if (inputPrice == null && outputPrice == null) {
    // Still include free models as $0 so the table is useful
    if (r.free === true || r.is_free === true || channel === "free") {
      return {
        channel,
        model,
        inputPrice: 0,
        cachePrice: 0,
        outputPrice: 0,
        unit: "USD / 1M tokens (free)",
      };
    }
    return null;
  }

  return {
    channel,
    model,
    inputPrice: inputPrice ?? 0,
    cachePrice: cachePrice ?? 0,
    outputPrice: outputPrice ?? 0,
    unit: firstString(pricing, ["unit", "price_unit"]) || "USD / 1M tokens",
  };
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

export async function fetchOmnirouteLlmPricing(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: boolean; rows: LlmPriceRow[]; detail: string; url: string }> {
  const base = omniBaseUrl();
  const path = omniPricingPath();
  const url = `${base}${path}`;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options?.timeoutMs ?? 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    /** @type {Record<string, string>} */
    const headers: Record<string, string> = { accept: "application/json" };
    const key = omniAdminKey();
    if (key) headers.authorization = `Bearer ${key}`;

    const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, rows: [], detail: `invalid JSON HTTP ${res.status}`, url };
    }
    if (!res.ok) {
      return { ok: false, rows: [], detail: `HTTP ${res.status}`, url };
    }
    const rows = normalizeOmniroutePricingPayload(body);
    if (rows.length === 0) {
      return { ok: false, rows: [], detail: "no price rows parsed from payload", url };
    }
    return { ok: true, rows, detail: `ok ${rows.length} rows`, url };
  } catch (error) {
    return {
      ok: false,
      rows: [],
      detail: error instanceof Error ? error.message : "fetch failed",
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolvePricingCatalog(input: ResolvePricingInput): Promise<PricingCatalogResponse> {
  const modeRaw = (input.mode ?? process.env.OMC_PRICING_SOURCE ?? "auto").toString().trim().toLowerCase();
  const mode: "auto" | "omniroute" | "static" =
    modeRaw === "omniroute" || modeRaw === "omni" || modeRaw === "remote"
      ? "omniroute"
      : modeRaw === "static" || modeRaw === "local"
        ? "static"
        : "auto";

  const loadLocal =
    input.loadLocal ??
    (async () => {
      // lazy import avoided — caller injects or we use default only
      return structuredClone(DEFAULT_PRICING_CATALOG);
    });

  const local = await loadLocal();

  if (mode === "static" || pricingDisabled()) {
    return {
      ...local,
      source: "static",
      mode: mode === "static" ? "static" : "auto",
      note:
        mode === "static" || pricingDisabled()
          ? `${local.note}（LLM 价目：本地静态；工具价始终本地）`
          : local.note,
      omniroute: {
        baseUrl: omniBaseUrl(),
        pricingPath: omniPricingPath(),
        ok: false,
        detail: pricingDisabled() ? "disabled by OMC_OMNIROUTE_PRICING" : "mode=static",
      },
    };
  }

  const remote = await fetchOmnirouteLlmPricing({ fetchImpl: input.fetchImpl });
  if (!remote.ok) {
    if (mode === "omniroute") {
      // Still return tools from local; empty llm with error detail
      return {
        ...local,
        llm: [],
        source: "static",
        mode: "omniroute",
        note: `OmniRoute 价目不可用（${remote.detail}），已回退本地工具价；LLM 行为空。`,
        updatedAt: new Date().toISOString(),
        omniroute: {
          baseUrl: omniBaseUrl(),
          pricingPath: omniPricingPath(),
          ok: false,
          detail: remote.detail,
          fetchedAt: new Date().toISOString(),
          rowCount: 0,
        },
      };
    }
    // auto → full local fallback
    return {
      ...local,
      source: "static",
      mode: "auto",
      note: `${local.note}（OmniRoute 不可用：${remote.detail}，LLM 使用本地参考价）`,
      omniroute: {
        baseUrl: omniBaseUrl(),
        pricingPath: omniPricingPath(),
        ok: false,
        detail: remote.detail,
        fetchedAt: new Date().toISOString(),
        rowCount: 0,
      },
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    note: "LLM 价目来自 OmniRoute 边车（参考价，非实时账单）；工具价为本公司本地参考。经 OMC Gateway 的工具调用才进企业计量。",
    llm: remote.rows,
    tools: local.tools,
    source: "mixed",
    mode,
    omniroute: {
      baseUrl: omniBaseUrl(),
      pricingPath: omniPricingPath(),
      ok: true,
      detail: remote.detail,
      fetchedAt: new Date().toISOString(),
      rowCount: remote.rows.length,
    },
  };
}

export async function loadLocalPricingCatalog(dataDir: string): Promise<PricingCatalog> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = await readFile(join(dataDir, "company", "pricing.json"), "utf8");
    return mergePricingCatalog(JSON.parse(raw) as Partial<PricingCatalog>);
  } catch {
    return structuredClone(DEFAULT_PRICING_CATALOG);
  }
}
