import type { ReactNode } from "react";

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { ApiError, apiGet, apiPost } from "./api";
import { MemberLoginCard } from "./member-login-card";
import { hasMemberSession, memberAuthHeaders, setMemberToken } from "./member-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "./shared-ui";

export interface AuditEventItem {
  id?: string;
  type: string;
  actorMemberId?: string;
  actorEmail?: string;
  at?: string;
  createdAt?: string;
  details?: Record<string, unknown>;
}

export interface AuditEventsPageResult {
  items: AuditEventItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Default page size for audit list (load more appends the same size). */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Load company audit events via the product API.
 * Works with member admin/auditor session, or console ops-admin (same-origin cookie).
 */
export async function loadAuditEvents(options?: {
  type?: string;
  limit?: number;
  offset?: number;
  fetchImpl?: typeof fetch;
}): Promise<AuditEventsPageResult> {
  const params = new URLSearchParams();
  if (options?.type) params.set("type", options.type);
  params.set("limit", String(options?.limit ?? AUDIT_PAGE_SIZE));
  params.set("offset", String(options?.offset ?? 0));
  const path = `/api/company/audit/events?${params}`;

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

function normalizeAuditPage(body: Partial<AuditEventsPageResult> | { items?: AuditEventItem[] }): AuditEventsPageResult {
  const items = body.items ?? [];
  const total = "total" in body && typeof body.total === "number" ? body.total : items.length;
  const limit = "limit" in body && typeof body.limit === "number" ? body.limit : items.length;
  const offset = "offset" in body && typeof body.offset === "number" ? body.offset : 0;
  const hasMore =
    "hasMore" in body && typeof body.hasMore === "boolean" ? body.hasMore : offset + items.length < total;
  return { items, total, limit, offset, hasMore };
}

/**
 * 审计事件 — 每页 50 条 + 加载更多；控制台 ops-admin 或成员 admin/auditor 可读。
 */
export function AuditEventsPage(): ReactNode {
  const [items, setItems] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [appliedType, setAppliedType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
          type: appliedType.trim() || undefined,
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
    [appliedType],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  function applyFilter(): void {
    setAppliedType(typeFilter.trim());
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
              控制台未解锁且无企业成员会话时，需登录后查看 login / config.write / member.* 等事件。
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
            产品事件流（login / config.write / member.*），每页 {AUDIT_PAGE_SIZE} 条。Action 运行见{" "}
            <Link to="/runs">运行</Link> 或 <Link to="/metering">计量</Link>。
          </p>
        </div>
        <div className="console-page-actions">
          <Input
            placeholder="类型过滤，如 login"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter();
            }}
            data-testid="audit-type-filter"
            style={{ maxWidth: 180 }}
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
              <th>操作者</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev, i) => {
              const when = ev.at || ev.createdAt || "—";
              const actor = ev.actorEmail || ev.actorMemberId || "—";
              const details = ev.details ? JSON.stringify(ev.details) : "";
              return (
                <tr key={ev.id || `${ev.type}-${when}-${i}`}>
                  <td className="console-row-meta mono">{when}</td>
                  <td>
                    <span className="team-pill" data-testid="audit-event-type">
                      {ev.type}
                    </span>
                  </td>
                  <td className="console-row-meta">{actor}</td>
                  <td
                    className="console-row-meta mono"
                    style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {details || "—"}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="console-row-meta" style={{ padding: 24, textAlign: "center" }}>
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
