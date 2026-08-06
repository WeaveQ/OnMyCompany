import type { ReactNode } from "react";

import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiGet } from "./api";
import { getActiveTeamId, hasMemberSession, memberAuthHeaders, subscribeActiveTeamId } from "./member-session";
import { InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MeterTab = "usage" | "logs" | "pricing";
type PriceSubTab = "llm" | "tools";

interface UsageSummary {
  totalRuns: number;
  okRuns: number;
  failedRuns: number;
  fallbackRuns: number;
  activeMembers: number;
  activeServices: number;
  byMember: Array<{ memberId: string; count: number }>;
  byService: Array<{ service: string; count: number }>;
  byAction: Array<{ actionId: string; count: number }>;
  byDay: Array<{ date: string; total: number; ok: number; failed: number }>;
  range: { from?: string; to?: string; appliedLimit: number; scanned: number };
}

interface RunItem {
  id: string;
  service: string;
  actionId: string;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  memberId?: string;
  connectionName?: string;
  attempt?: number;
  fallback?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

interface PricingCatalog {
  updatedAt: string;
  note: string;
  llm: Array<{
    channel: string;
    model: string;
    inputPrice: number;
    cachePrice: number;
    outputPrice: number;
  }>;
  tools: Array<{ service: string; price: string; description: string }>;
  source?: "omniroute" | "static" | "mixed";
  mode?: "auto" | "omniroute" | "static";
  omniroute?: {
    baseUrl: string;
    pricingPath: string;
    ok: boolean;
    detail?: string;
    fetchedAt?: string;
    rowCount?: number;
  };
}

interface LlmUsageSummary {
  source: "omniroute" | "unavailable";
  ok: boolean;
  detail?: string;
  dashboardUrl: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Array<{ key: string; requests: number; promptTokens: number; completionTokens: number; cost: number }>;
  byModel: Array<{ key: string; requests: number; promptTokens: number; completionTokens: number; cost: number }>;
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function toRangeQuery(from: string, to: string): { fromIso: string; toIso: string } {
  return {
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
  };
}

function formatRunTime(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19);
}

interface MeteringPageProps {
  activeTeamId?: string;
}

/**
 * 计量计费 — usage / logs / reference pricing (G2).
 * Uses /api/company/* only (member session). Never ops-admin /api/runs.
 */
export function MeteringPage(props: MeteringPageProps = {}): ReactNode {
  const [tab, setTab] = useState<MeterTab>("usage");
  const [priceSub, setPriceSub] = useState<PriceSubTab>("llm");
  const range0 = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(range0.from);
  const [to, setTo] = useState(range0.to);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageSummary | null>(null);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [runsMeta, setRunsMeta] = useState<{ totalMatched: number; scanned: number } | null>(null);
  const [pricing, setPricing] = useState<PricingCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needMemberLogin, setNeedMemberLogin] = useState(false);
  const [teamId, setTeamId] = useState<string | undefined>(() => props.activeTeamId || getActiveTeamId());

  useEffect(() => {
    setTeamId(props.activeTeamId || getActiveTeamId());
  }, [props.activeTeamId]);

  useEffect(() => subscribeActiveTeamId((id) => setTeamId(id)), []);

  const handleAuthError = useCallback((err: unknown, fallbackMessage: string) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      const msg = err.message.toLowerCase();
      if (msg.includes("member") || msg.includes("unauthenticated") || err.status === 401) {
        setNeedMemberLogin(true);
      }
    }
    setError(err instanceof ApiError ? err.message : fallbackMessage);
  }, []);

  const loadUsage = useCallback(async () => {
    setError(null);
    setNeedMemberLogin(false);
    setLoading(true);
    try {
      const { fromIso, toIso } = toRangeQuery(from, to);
      const q = new URLSearchParams({ limit: "5000", from: fromIso, to: toIso });
      if (teamId) q.set("teamId", teamId);
      const data = await apiGet<UsageSummary>(`/api/company/usage?${q}`, memberAuthHeaders());
      setUsage(data);
      // LLM plane from OmniRoute sidecar (does not fail the whole page if offline)
      try {
        const llmQ = new URLSearchParams({ from, to });
        const llm = await apiGet<LlmUsageSummary>(`/api/company/usage/llm?${llmQ}`, memberAuthHeaders());
        setLlmUsage(llm);
      } catch {
        setLlmUsage(null);
      }
    } catch (err) {
      handleAuthError(err, "加载用量失败");
    } finally {
      setLoading(false);
    }
  }, [from, to, teamId, handleAuthError]);

  const loadRuns = useCallback(async () => {
    setError(null);
    setNeedMemberLogin(false);
    setLoading(true);
    try {
      const { fromIso, toIso } = toRangeQuery(from, to);
      const q = new URLSearchParams({ limit: "100", from: fromIso, to: toIso });
      if (teamId) q.set("teamId", teamId);
      const page = await apiGet<{ items: RunItem[]; totalMatched: number; scanned: number }>(
        `/api/company/runs?${q}`,
        memberAuthHeaders(),
      );
      setRuns(page.items ?? []);
      setRunsMeta({ totalMatched: page.totalMatched ?? 0, scanned: page.scanned ?? 0 });
    } catch (err) {
      handleAuthError(err, "加载日志失败");
    } finally {
      setLoading(false);
    }
  }, [from, to, teamId, handleAuthError]);

  const loadPricing = useCallback(async () => {
    setError(null);
    setNeedMemberLogin(false);
    setLoading(true);
    try {
      const data = await apiGet<PricingCatalog>("/api/company/pricing?source=auto", memberAuthHeaders());
      setPricing(data);
    } catch (err) {
      handleAuthError(err, "加载价格失败");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (tab === "usage") void loadUsage();
    else if (tab === "logs") void loadRuns();
    else void loadPricing();
  }, [tab, loadUsage, loadRuns, loadPricing]);

  const dayMax = useMemo(() => Math.max(1, ...(usage?.byDay.map((d) => d.total) ?? [1])), [usage?.byDay]);

  const metaLine = useMemo(() => {
    if (tab === "usage" && usage) {
      return `扫描 ${usage.range.scanned} · 命中 ${usage.totalRuns}`;
    }
    if (tab === "logs" && runsMeta) {
      return `扫描 ${runsMeta.scanned} · 命中 ${runsMeta.totalMatched} · 显示 ${runs.length}`;
    }
    return null;
  }, [tab, usage, runsMeta, runs.length]);

  function resetRange(): void {
    const r = defaultDateRange();
    setFrom(r.from);
    setTo(r.to);
  }

  function queryCurrent(): void {
    void (tab === "usage" ? loadUsage() : loadRuns());
  }

  if (needMemberLogin) {
    return (
      <div className="page-stack metering-page">
        <div className="console-card metering-login-card">
          <strong className="console-row-title">需要成员登录</strong>
          <p className="console-card-subtitle">
            计量计费走企业成员会话（与团队同一套登录），不是 ops-admin 控制台 token。
            {hasMemberSession() ? " 当前 token 可能已失效，请重新登录。" : " 请先在团队页完成邮箱 OTP 登录。"}
          </p>
          {error ? <InlineError message={error} /> : null}
          <div>
            <Button asChild>
              <Link to="/team">前往团队登录</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack metering-page">
      <div className="metering-tabs-row">
        <div className="metering-tabs" role="tablist" aria-label="计量计费">
          {(
            [
              ["usage", "用量"],
              ["logs", "日志"],
              ["pricing", "价格"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "metering-tab is-active" : "metering-tab"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="metering-tabs-meta">
          {metaLine ? <span className="metering-meta">{metaLine}</span> : null}
          <Button variant="ghost" size="sm" type="button" className="metering-ops-link" asChild>
            <Link to="/runs">
              运维运行记录
              <ExternalLink size={13} />
            </Link>
          </Button>
        </div>
      </div>

      <p className="metering-scope-hint">
        用量分两本账：上方 <strong>工具</strong> 只统计经 OMC Gateway 的 Action / MCP；
        <strong> LLM</strong> 从 OmniRoute 边车拉取（聊天 token，无企业 member 归因）。
      </p>

      {error ? <InlineError message={error} /> : null}

      {tab === "usage" || tab === "logs" ? (
        <div className="metering-toolbar">
          <div className="metering-toolbar-fields">
            <label className="metering-field">
              <span>开始</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <span className="metering-range-sep" aria-hidden>
              —
            </span>
            <label className="metering-field">
              <span>结束</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="metering-toolbar-actions">
            <Button variant="outline" size="sm" type="button" onClick={resetRange}>
              重置
            </Button>
            <Button size="sm" type="button" onClick={queryCurrent} disabled={loading}>
              <Search size={14} />
              查询
            </Button>
            {tab === "logs" ? (
              <Button variant="outline" size="sm" type="button" onClick={() => void loadRuns()} disabled={loading}>
                <RefreshCw size={14} className={loading ? "spin" : undefined} />
                刷新
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="metering-stack">
          <section className="metering-plane" data-usage-plane="llm">
            <div className="metering-plane-head">
              <div>
                <strong>LLM 用量 · OmniRoute</strong>
                <p className="console-row-meta" style={{ margin: "4px 0 0" }}>
                  {llmUsage?.ok
                    ? `边车可达 · 请求 ${llmUsage.totalRequests} · token ${llmUsage.totalTokens}`
                    : llmUsage
                      ? `边车不可用：${llmUsage.detail || "—"}（npm run dev:omniroute）`
                      : "加载中或未探测…"}
                </p>
              </div>
              {llmUsage?.dashboardUrl ? (
                <Button variant="ghost" size="sm" type="button" asChild>
                  <a href={llmUsage.dashboardUrl} target="_blank" rel="noreferrer">
                    Omni 看板 <ExternalLink size={13} />
                  </a>
                </Button>
              ) : null}
            </div>
            {llmUsage?.ok ? (
              <>
                <div className="metering-kpi-grid">
                  <Kpi label="请求数" value={llmUsage.totalRequests} />
                  <Kpi label="Prompt tokens" value={llmUsage.totalPromptTokens} />
                  <Kpi label="Completion tokens" value={llmUsage.totalCompletionTokens} />
                  <Kpi label="总 tokens" value={llmUsage.totalTokens} />
                  <Kpi label="估算花费" value={formatCost(llmUsage.totalCost)} />
                  <Kpi label="模型数" value={llmUsage.byModel.length} />
                </div>
                <div className="metering-two-col">
                  <BreakdownList title="按模型" rows={llmUsage.byModel.slice(0, 12)} />
                  <BreakdownList title="按提供商" rows={llmUsage.byProvider.slice(0, 12)} />
                </div>
              </>
            ) : (
              <div className="metering-panel">
                <div className="console-empty">
                  {llmUsage && !llmUsage.ok
                    ? "未能从 OmniRoute 拉取 LLM 用量"
                    : loading
                      ? "加载中…"
                      : "暂无 LLM 用量数据"}
                </div>
              </div>
            )}
          </section>

          <section className="metering-plane" data-usage-plane="tools">
            <div className="metering-plane-head">
              <div>
                <strong>工具用量 · OMC Gateway</strong>
                <p className="console-row-meta" style={{ margin: "4px 0 0" }}>
                  Action / MCP · 成员归因
                </p>
              </div>
            </div>
            <div className="metering-kpi-grid">
              <Kpi label="事件数" value={usage?.totalRuns ?? 0} />
              <Kpi label="成功" value={usage?.okRuns ?? 0} tone="ok" />
              <Kpi label="失败" value={usage?.failedRuns ?? 0} tone={usage?.failedRuns ? "bad" : undefined} />
              <Kpi label="Fallback" value={usage?.fallbackRuns ?? 0} />
              <Kpi label="活跃成员" value={usage?.activeMembers ?? 0} />
              <Kpi label="活跃服务" value={usage?.activeServices ?? 0} />
            </div>

            <div className="metering-two-col">
              <div className="metering-panel">
                <div className="metering-panel-head">
                  <strong>用量趋势</strong>
                  <span className="console-row-meta">按日 · 工具</span>
                </div>
                {loading && !usage ? (
                  <div className="console-empty">加载中…</div>
                ) : usage?.byDay?.length ? (
                  <ul className="metering-day-list">
                    {usage.byDay.map((d) => (
                      <li key={d.date}>
                        <span className="metering-day-date">{d.date}</span>
                        <span className="metering-day-bar-wrap">
                          <span
                            className="metering-day-bar"
                            style={{ width: `${Math.max(4, (d.total / dayMax) * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums metering-day-count">{d.total}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="console-empty">暂无数据</div>
                )}
              </div>
              <div className="metering-panel">
                <div className="metering-panel-head">
                  <strong>来源排行</strong>
                  <span className="console-row-meta">按服务</span>
                </div>
                {usage?.byService?.length ? (
                  <ul className="metering-rank-list">
                    {usage.byService.slice(0, 12).map((row) => (
                      <li key={row.service}>
                        <span className="metering-rank-name">{row.service}</span>
                        <span className="tabular-nums metering-rank-count">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="console-empty">{loading ? "加载中…" : "暂无数据"}</div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "logs" ? (
        <div className="metering-panel metering-logs-panel">
          {loading && runs.length === 0 ? (
            <div className="console-empty">加载中…</div>
          ) : runs.length === 0 ? (
            <div className="console-empty">该时间范围内暂无 Gateway 调用日志</div>
          ) : (
            <div className="metering-table-wrap">
              <table className="metering-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>服务</th>
                    <th>操作</th>
                    <th>连接</th>
                    <th>状态</th>
                    <th className="is-num">耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="metering-cell-time">{formatRunTime(r.startedAt)}</td>
                      <td className="metering-cell-service">{r.service}</td>
                      <td>
                        <code className="metering-code">{r.actionId}</code>
                      </td>
                      <td className="metering-cell-conn">
                        <span>{r.connectionName || "—"}</span>
                        {r.fallback ? <span className="metering-tag">fallback</span> : null}
                        {r.attempt && r.attempt > 1 ? (
                          <span className="metering-tag is-muted">#{r.attempt}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={r.ok ? "metering-status is-ok" : "metering-status is-bad"}>
                          {r.ok ? "成功" : r.errorCode || "失败"}
                        </span>
                      </td>
                      <td className="tabular-nums is-num">{r.durationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "pricing" ? (
        <div className="metering-panel">
          <div className="metering-panel-head">
            <div className="metering-subtabs" role="tablist" aria-label="价格类型">
              <button
                type="button"
                className={priceSub === "llm" ? "metering-subtab is-active" : "metering-subtab"}
                onClick={() => setPriceSub("llm")}
              >
                LLM
              </button>
              <button
                type="button"
                className={priceSub === "tools" ? "metering-subtab is-active" : "metering-subtab"}
                onClick={() => setPriceSub("tools")}
              >
                工具
              </button>
            </div>
            <Button variant="ghost" size="sm" type="button" onClick={() => void loadPricing()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              刷新
            </Button>
          </div>
          {pricing ? (
            <div className="metering-pricing-note" data-testid="pricing-source-note">
              <p style={{ margin: 0 }}>
                {pricing.note}
                {pricing.updatedAt ? ` · 更新于 ${pricing.updatedAt}` : null}
              </p>
              <p className="console-row-meta" style={{ margin: "6px 0 0" }}>
                来源：
                {pricing.source === "mixed"
                  ? "LLM ← OmniRoute 边车 · 工具 ← 本地"
                  : pricing.source === "omniroute"
                    ? "OmniRoute"
                    : "本地静态参考价"}
                {pricing.omniroute
                  ? ` · 边车 ${pricing.omniroute.ok ? "可达" : "不可用"}（${pricing.omniroute.detail || "—"}）`
                  : null}
                {pricing.omniroute?.rowCount != null && pricing.omniroute.ok
                  ? ` · ${pricing.omniroute.rowCount} 条 LLM`
                  : null}
              </p>
            </div>
          ) : null}
          {loading && !pricing ? (
            <div className="console-empty">加载中…</div>
          ) : priceSub === "llm" ? (
            pricing?.llm?.length ? (
              <div className="metering-table-wrap">
                <table className="metering-table">
                  <thead>
                    <tr>
                      <th>渠道</th>
                      <th>模型</th>
                      <th className="is-num">输入</th>
                      <th className="is-num">缓存</th>
                      <th className="is-num">输出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.llm.map((row) => (
                      <tr key={`${row.channel}-${row.model}`}>
                        <td>{row.channel}</td>
                        <td>
                          <code className="metering-code">{row.model}</code>
                        </td>
                        <td className="tabular-nums is-num">{row.inputPrice}</td>
                        <td className="tabular-nums is-num">{row.cachePrice}</td>
                        <td className="tabular-nums is-num">{row.outputPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="console-empty">暂无数据</div>
            )
          ) : pricing?.tools?.length ? (
            <div className="metering-table-wrap">
              <table className="metering-table">
                <thead>
                  <tr>
                    <th>服务</th>
                    <th>价格</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.tools.map((row) => (
                    <tr key={row.service}>
                      <td>
                        <code className="metering-code">{row.service}</code>
                      </td>
                      <td>{row.price}</td>
                      <td className="console-row-meta">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="console-empty">暂无数据</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Kpi(props: { label: string; value: number | string; tone?: "ok" | "bad" }): ReactNode {
  return (
    <div className={props.tone ? `metering-kpi is-${props.tone}` : "metering-kpi"}>
      <div className="metering-kpi-label">{props.label}</div>
      <div className="metering-kpi-value tabular-nums">{props.value}</div>
    </div>
  );
}

function formatCost(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function BreakdownList(props: {
  title: string;
  rows: Array<{ key: string; requests: number; promptTokens: number; completionTokens: number; cost: number }>;
}): ReactNode {
  return (
    <div className="metering-panel">
      <div className="metering-panel-head">
        <strong>{props.title}</strong>
        <span className="console-row-meta">LLM</span>
      </div>
      {props.rows.length === 0 ? (
        <div className="console-empty">暂无数据</div>
      ) : (
        <div className="metering-table-wrap">
          <table className="metering-table">
            <thead>
              <tr>
                <th>名称</th>
                <th className="is-num">请求</th>
                <th className="is-num">Tokens</th>
                <th className="is-num">花费</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <code className="metering-code">{r.key}</code>
                  </td>
                  <td className="tabular-nums is-num">{r.requests}</td>
                  <td className="tabular-nums is-num">{r.promptTokens + r.completionTokens}</td>
                  <td className="tabular-nums is-num">{formatCost(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
