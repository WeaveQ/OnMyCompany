import type { ReactNode } from "react";

import { Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiGet, apiPost } from "./api";
import { MemberLoginCard } from "./member-login-card";
import { getMemberToken, hasMemberSession, memberAuthHeaders, setMemberToken } from "./member-session";
import { InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AuditEventItem {
  id?: string;
  type: string;
  actorMemberId?: string;
  actorEmail?: string;
  at?: string;
  createdAt?: string;
  summary?: string;
  client?: string;
  ip?: string;
  result?: string;
  details?: Record<string, unknown>;
}

export interface AuditEventsPageResult {
  items: AuditEventItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AuditListQuery {
  type?: string;
  client?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Default page size for audit list (load more appends the same size). */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Build query string for GET /api/company/audit/events from filter fields.
 * Exported for unit tests of the real API shape used by the page.
 */
export function buildAuditEventsQuery(options?: AuditListQuery): string {
  const params = new URLSearchParams();
  if (options?.type?.trim()) params.set("type", options.type.trim());
  if (options?.client?.trim()) params.set("client", options.client.trim());
  if (options?.actor?.trim()) params.set("actor", options.actor.trim());
  if (options?.q?.trim()) params.set("q", options.q.trim());
  if (options?.from?.trim()) params.set("from", options.from.trim());
  if (options?.to?.trim()) params.set("to", options.to.trim());
  params.set("limit", String(options?.limit ?? AUDIT_PAGE_SIZE));
  params.set("offset", String(options?.offset ?? 0));
  return params.toString();
}

/**
 * Load company audit events via the product API.
 * Works with member admin/auditor session, or console ops-admin (same-origin cookie).
 */
export async function loadAuditEvents(
  options?: AuditListQuery & {
    fetchImpl?: typeof fetch;
  },
): Promise<AuditEventsPageResult> {
  const path = `/api/company/audit/events?${buildAuditEventsQuery(options)}`;

  if (options?.fetchImpl) {
    const headers = new Headers();
    const bearer = memberAuthHeaders().bearerToken;
    if (bearer) headers.set("authorization", `Bearer ${bearer}`);
    const res = await options.fetchImpl(path, {
      headers,
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new ApiError(res.status, `audit events ${res.status}`);
    }
    return normalizeAuditPage(await res.json());
  }

  const body = await apiGet<Partial<AuditEventsPageResult>>(path, memberAuthHeaders());
  return normalizeAuditPage(body);
}

/**
 * Trigger events export download (CSV by default). Uses real export path.
 */
export async function exportAuditEvents(options?: {
  format?: "csv" | "jsonl";
  type?: string;
  client?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ blob: Blob; filename: string }> {
  const format = options?.format ?? "csv";
  const params = new URLSearchParams();
  params.set("kind", "events");
  params.set("format", format);
  params.set("limit", "10000");
  if (options?.type?.trim()) params.set("type", options.type.trim());
  if (options?.client?.trim()) params.set("client", options.client.trim());
  if (options?.actor?.trim()) params.set("actor", options.actor.trim());
  if (options?.q?.trim()) params.set("q", options.q.trim());
  if (options?.from?.trim()) params.set("from", options.from.trim());
  if (options?.to?.trim()) params.set("to", options.to.trim());
  const path = `/api/company/audit/export?${params}`;

  const headers = new Headers();
  const bearer = getMemberToken();
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);

  const fetchImpl = options?.fetchImpl ?? fetch;
  const res = await fetchImpl(path, { headers, credentials: "same-origin" });
  if (!res.ok) {
    throw new ApiError(res.status, `audit export ${res.status}`);
  }
  const blob = await res.blob();
  const filename = format === "csv" ? "audit-events.csv" : "audit-events.jsonl";
  return { blob, filename };
}

/** Readable date presets → ISO from/to for the audit API. */
export function datePresetRange(preset: "today" | "7d" | "30d" | "all"): { from?: string; to?: string } {
  if (preset === "all") return {};
  const now = new Date();
  const end = now.toISOString();
  const start = new Date(now);
  if (preset === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    start.setUTCDate(start.getUTCDate() - 30);
  }
  return { from: start.toISOString(), to: end };
}

function normalizeAuditPage(
  body: Partial<AuditEventsPageResult> | { items?: AuditEventItem[] },
): AuditEventsPageResult {
  const items = body.items ?? [];
  const total = "total" in body && typeof body.total === "number" ? body.total : items.length;
  const limit = "limit" in body && typeof body.limit === "number" ? body.limit : items.length;
  const offset = "offset" in body && typeof body.offset === "number" ? body.offset : 0;
  const hasMore = "hasMore" in body && typeof body.hasMore === "boolean" ? body.hasMore : offset + items.length < total;
  return { items, total, limit, offset, hasMore };
}

/**
 * 审计事件 — 日期/类型/搜索 + 可读列 + CSV 导出；控制台 ops-admin 或成员 admin/auditor 可读。
 */
export function AuditEventsPage(): ReactNode {
  const [items, setItems] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [datePreset, setDatePreset] = useState<"today" | "7d" | "30d" | "all">("30d");
  const [applied, setApplied] = useState<AuditListQuery>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("admin@company.internal");
  const [loginCode, setLoginCode] = useState("000000");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await loadAuditEvents({
          ...applied,
          limit: AUDIT_PAGE_SIZE,
          offset,
        });
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setHasMore(page.hasMore);
        setNeedLogin(false);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "加载审计事件失败";
        setError(message);
        if (!append) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
        }
        if (err instanceof ApiError && err.status === 401) {
          setNeedLogin(true);
        } else if (err instanceof ApiError && err.status === 403 && !hasMemberSession()) {
          setNeedLogin(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [applied],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  function applyFilter(): void {
    const range = datePresetRange(datePreset);
    setApplied({
      type: typeFilter.trim() || undefined,
      q: queryFilter.trim() || undefined,
      actor: actorFilter.trim() || undefined,
      client: clientFilter.trim() || undefined,
      from: range.from,
      to: range.to,
    });
  }

  async function onExport(): Promise<void> {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportAuditEvents({
        format: "csv",
        type: applied.type,
        client: applied.client,
        actor: applied.actor,
        q: applied.q,
        from: applied.from,
        to: applied.to,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function login(): Promise<void> {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await apiPost("/api/company/auth/email/start", { email: loginEmail.trim() });
      const verified = await apiPost<{ token: string }>("/api/company/auth/email/verify", {
        email: loginEmail.trim(),
        code: loginCode.trim(),
      });
      if (!verified.token) {
        throw new Error("登录响应无 token");
      }
      setMemberToken(verified.token);
      setNeedLogin(false);
      await loadPage(0, false);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }

  if (needLogin) {
    return (
      <div className="console-page" data-testid="audit-events-page">
        <header className="console-page-header">
          <div>
            <h1>审计事件</h1>
            <p className="console-page-desc">
              控制台未解锁且无企业成员会话时，需登录后查看 login / config / token / connection 等事件。
            </p>
          </div>
        </header>
        <MemberLoginCard
          title="登录后查看审计"
          description="本地开发：邮箱 admin@company.internal，验证码 000000。若已用控制台 admin token 解锁，刷新本页即可，无需再登。"
          email={loginEmail}
          code={loginCode}
          loading={loginLoading}
          error={loginError}
          onEmailChange={setLoginEmail}
          onCodeChange={setLoginCode}
          onSubmit={() => void login()}
        />
        <p className="console-row-meta" style={{ marginTop: 12 }}>
          也可在 <Link to="/team">团队</Link> / <Link to="/org-config">企业设置</Link> 登录后回到本页。
        </p>
      </div>
    );
  }

  return (
    <div className="console-page" data-testid="audit-events-page">
      <header className="console-page-header">
        <div>
          <h1>审计事件</h1>
          <p className="console-page-desc">
            组织运营与管控事件（登录、成员、配置、token、连接、策略拒绝、Skill）。Action 执行历史见{" "}
            <Link to="/runs">运行</Link> 或 <Link to="/metering">计量</Link>。
          </p>
        </div>
        <div className="console-page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
            data-testid="audit-date-preset"
            aria-label="日期范围"
            style={{ maxWidth: 120, height: 32 }}
          >
            <option value="today">今日</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="all">全部</option>
          </select>
          <Input
            placeholder="类型，如 login / token"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            data-testid="audit-type-filter"
            style={{ maxWidth: 140 }}
          />
          <Input
            placeholder="操作人"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            data-testid="audit-actor-filter"
            style={{ maxWidth: 140 }}
          />
          <Input
            placeholder="操作端 client"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            data-testid="audit-client-filter"
            style={{ maxWidth: 120 }}
          />
          <Input
            placeholder="搜索内容"
            value={queryFilter}
            onChange={(e) => setQueryFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            data-testid="audit-q-filter"
            style={{ maxWidth: 160 }}
          />
          <Button variant="outline" size="sm" onClick={applyFilter} data-testid="audit-type-apply">
            筛选
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPage(0, false)}
            data-testid="audit-events-refresh"
          >
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void onExport()}
            data-testid="audit-events-export"
          >
            {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            导出 CSV
          </Button>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {loading && items.length === 0 ? <div className="console-empty">加载中…</div> : null}

      <div className="console-card" style={{ overflowX: "auto" }}>
        <table className="team-manage-table" data-testid="audit-events-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>内容</th>
              <th>操作端</th>
              <th>操作者</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev, i) => {
              const when = ev.at || ev.createdAt || "—";
              const actor = ev.actorEmail || ev.actorMemberId || "—";
              const summary = ev.summary || (ev.details ? compactDetails(ev.details) : "") || "—";
              return (
                <tr key={ev.id || `${ev.type}-${when}-${i}`}>
                  <td className="console-row-meta mono">{when}</td>
                  <td>
                    <span className="team-pill" data-testid="audit-event-type">
                      {ev.type}
                    </span>
                  </td>
                  <td
                    className="console-row-meta"
                    style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}
                    data-testid="audit-event-summary"
                    title={summary}
                  >
                    {summary}
                  </td>
                  <td className="console-row-meta">{ev.client || "—"}</td>
                  <td className="console-row-meta">{actor}</td>
                  <td className="console-row-meta mono">{ev.ip || "—"}</td>
                </tr>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="console-row-meta" style={{ padding: 24, textAlign: "center" }}>
                  暂无审计事件
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="list-page-footer" data-testid="audit-events-footer">
        <span className="console-row-meta tabular-nums">
          已显示 {items.length}
          {total > 0 ? ` / ${total}` : ""} 条
        </span>
        {hasMore ? (
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore || loading}
            onClick={() => void loadPage(items.length, true)}
            data-testid="audit-events-load-more"
          >
            {loadingMore ? <Loader2 size={14} className="spin" /> : null}
            加载更多
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function compactDetails(details: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(details);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "";
  }
}
