/**
 * B-style: pull LLM usage summary from OmniRoute sidecar.
 * Does not merge into tool runs — separate plane.
 */

export interface LlmUsageByKey {
  key: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  extra?: Record<string, unknown>;
}

export interface LlmUsageSummary {
  source: "omniroute" | "unavailable";
  ok: boolean;
  detail?: string;
  fetchedAt: string;
  baseUrl: string;
  path: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  byProvider: LlmUsageByKey[];
  byModel: LlmUsageByKey[];
  byAccount: LlmUsageByKey[];
  /** Raw last buckets if present (shape varies) */
  series?: unknown;
  dashboardUrl: string;
}

function omniBaseUrl(): string {
  return (
    process.env.OMC_OMNIROUTE_URL?.trim() ||
    process.env.OMC_MODEL_ROUTER_URL?.trim() ||
    "http://127.0.0.1:20128"
  ).replace(/\/+$/, "");
}

function omniUsagePath(): string {
  const raw = process.env.OMC_OMNIROUTE_USAGE_PATH?.trim() || "/api/usage/history";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function omniAdminKey(): string | undefined {
  return (
    process.env.OMC_OMNIROUTE_ADMIN_KEY?.trim() ||
    process.env.OMC_OMNIROUTE_API_KEY?.trim() ||
    undefined
  );
}

function dashboardUrl(): string {
  return (
    process.env.OMC_OMNIROUTE_DASHBOARD_URL?.trim() ||
    `${omniBaseUrl()}/dashboard`
  );
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function mapBreakdown(obj: unknown): LlmUsageByKey[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const rows: LlmUsageByKey[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof val !== "object" || val == null) continue;
    const v = val as Record<string, unknown>;
    rows.push({
      key,
      requests: num(v.requests ?? v.count ?? v.totalRequests),
      promptTokens: num(v.promptTokens ?? v.prompt_tokens ?? v.inputTokens),
      completionTokens: num(v.completionTokens ?? v.completion_tokens ?? v.outputTokens),
      cost: num(v.cost ?? v.totalCost ?? v.spend),
      extra: {
        provider: v.provider,
        rawModel: v.rawModel,
        lastUsed: v.lastUsed,
        connectionId: v.connectionId,
        accountName: v.accountName,
      },
    });
  }
  rows.sort((a, b) => b.requests - a.requests || b.cost - a.cost);
  return rows;
}

export function normalizeOmnirouteUsagePayload(payload: unknown): Omit<
  LlmUsageSummary,
  "source" | "ok" | "detail" | "fetchedAt" | "baseUrl" | "path" | "dashboardUrl"
> {
  const empty = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    byProvider: [] as LlmUsageByKey[],
    byModel: [] as LlmUsageByKey[],
    byAccount: [] as LlmUsageByKey[],
    series: undefined as unknown,
  };
  if (!payload || typeof payload !== "object") return empty;
  const p = payload as Record<string, unknown>;
  const totalPromptTokens = num(p.totalPromptTokens ?? p.promptTokens ?? p.inputTokens);
  const totalCompletionTokens = num(
    p.totalCompletionTokens ?? p.completionTokens ?? p.outputTokens,
  );
  return {
    totalRequests: num(p.totalRequests ?? p.requests ?? p.count),
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    totalCost: num(p.totalCost ?? p.cost ?? p.spend),
    byProvider: mapBreakdown(p.byProvider ?? p.providers),
    byModel: mapBreakdown(p.byModel ?? p.models),
    byAccount: mapBreakdown(p.byAccount ?? p.accounts),
    series: p.last10Minutes ?? p.series ?? p.byDay ?? p.timeline,
  };
}

export async function fetchOmnirouteLlmUsage(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  from?: string;
  to?: string;
}): Promise<LlmUsageSummary> {
  const baseUrl = omniBaseUrl();
  const path = omniUsagePath();
  const qs = new URLSearchParams();
  if (options?.from) qs.set("from", options.from);
  if (options?.to) qs.set("to", options.to);
  const q = qs.toString();
  const url = `${baseUrl}${path}${q ? `?${q}` : ""}`;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options?.timeoutMs ?? 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchedAt = new Date().toISOString();

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const key = omniAdminKey();
    if (key) headers.authorization = `Bearer ${key}`;

    const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return {
        source: "unavailable",
        ok: false,
        detail: `invalid JSON HTTP ${res.status}`,
        fetchedAt,
        baseUrl,
        path,
        dashboardUrl: dashboardUrl(),
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        byProvider: [],
        byModel: [],
        byAccount: [],
      };
    }
    if (!res.ok) {
      return {
        source: "unavailable",
        ok: false,
        detail: `HTTP ${res.status}`,
        fetchedAt,
        baseUrl,
        path,
        dashboardUrl: dashboardUrl(),
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        byProvider: [],
        byModel: [],
        byAccount: [],
      };
    }
    const norm = normalizeOmnirouteUsagePayload(body);
    return {
      source: "omniroute",
      ok: true,
      detail: "ok",
      fetchedAt,
      baseUrl,
      path,
      dashboardUrl: dashboardUrl(),
      ...norm,
    };
  } catch (error) {
    return {
      source: "unavailable",
      ok: false,
      detail: error instanceof Error ? error.message : "fetch failed",
      fetchedAt,
      baseUrl,
      path,
      dashboardUrl: dashboardUrl(),
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: [],
      byModel: [],
      byAccount: [],
    };
  } finally {
    clearTimeout(timer);
  }
}
