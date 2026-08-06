import type { AppData } from "./model";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import {
  Activity,
  ArrowUpRight,
  Cable,
  CircleDashed,
  ExternalLink,
  Gauge,
  Shield,
  Sparkles,
  Waypoints,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiGet } from "./api";
import { getActiveTeamId, getMemberToken, subscribeActiveTeamId } from "./member-session";
import { createOverviewSummary } from "./model";
import { Button } from "@/components/ui/button";

interface OverviewPageProps {
  data: AppData;
  onRefresh(): void;
  activeTeamId?: string;
}

interface CompanyOverview {
  orgId: string;
  configVersion: string;
  memberCount: number;
  orgSkillCount: number;
  recentPolicyDenyCount: number;
}

interface UsageSummary {
  totalRuns: number;
  okRuns: number;
  failedRuns: number;
  byService: Array<{ service: string; count: number }>;
  byMember: Array<{ memberId: string; count: number }>;
}

interface LlmUsageSummary {
  ok: boolean;
  detail?: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{ key: string; requests: number }>;
  dashboardUrl: string;
}

interface ModelRouterHealth {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  v1Url: string;
  dashboardUrl: string;
  ok: boolean | null;
  detail?: string;
}

/** Structural markers for tests / screenshot QA. */
export const OVERVIEW_SECTION_IDS = ["observability", "capability", "team-usage", "personal-usage"] as const;

export function OverviewPage(props: OverviewPageProps): ReactNode {
  const t = useTranslate();
  const summary = createOverviewSummary(props.data);
  const [company, setCompany] = useState<CompanyOverview | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageSummary | null>(null);
  const [modelRouter, setModelRouter] = useState<ModelRouterHealth | null>(null);
  const [teamId, setTeamId] = useState<string | undefined>(() => props.activeTeamId || getActiveTeamId());
  const token = getMemberToken();

  useEffect(() => {
    setTeamId(props.activeTeamId || getActiveTeamId());
  }, [props.activeTeamId]);

  useEffect(() => subscribeActiveTeamId((id) => setTeamId(id)), []);

  useEffect(() => {
    void apiGet<{ modelRouter?: ModelRouterHealth }>("/api/company/health")
      .then((h) => setModelRouter(h.modelRouter ?? null))
      .catch(() => setModelRouter(null));
  }, [props.data]);

  useEffect(() => {
    if (!token) {
      setCompany(null);
      setUsage(null);
      setLlmUsage(null);
      return;
    }
    void apiGet<CompanyOverview>("/api/company/overview", { bearerToken: token })
      .then(setCompany)
      .catch(() => setCompany(null));
    const q = new URLSearchParams({ limit: "2000" });
    if (teamId && teamId !== "__all__") q.set("teamId", teamId);
    void apiGet<UsageSummary>(`/api/company/usage?${q}`, { bearerToken: token })
      .then(setUsage)
      .catch(() => setUsage(null));
    void apiGet<LlmUsageSummary>("/api/company/usage/llm", { bearerToken: token })
      .then(setLlmUsage)
      .catch(() => setLlmUsage(null));
  }, [token, props.data, teamId]);

  const connected = summary.connectedCount;
  const totalProviders = Math.max(summary.providerCount, 1);
  const executable = summary.locallyExecutableActionCount;
  const routerOk = modelRouter?.ok === true;
  const routerDown = modelRouter?.enabled !== false && modelRouter?.ok === false;
  const dashboardUrl = llmUsage?.dashboardUrl || modelRouter?.dashboardUrl || "http://127.0.0.1:20128/dashboard";
  const toolRuns = usage?.totalRuns ?? 0;
  const connPct = Math.round((connected / totalProviders) * 100);

  // Empty product: connect first. Logged-in empty: run once. Else quiet.
  const primaryCta =
    connected === 0
      ? { label: "连接应用", to: "/connections" as const }
      : !token
        ? { label: "登录组织", to: "/members" as const }
        : toolRuns === 0
          ? { label: "打开连接器", to: "/connections" as const }
          : null;

  return (
    <div className="page-stack overview-page" data-overview-root>
      <header className="page-hero overview-hero">
        <div className="overview-hero-text">
          <h1 className="page-hero-title">概览</h1>
          <p className="page-hero-lead">
            {connected === 0 ? "先连一个办公应用，再看用量与审计。" : "模型账看 token，工具账看外发。"}
          </p>
        </div>
        <div className="overview-hero-org">
          {company ? (
            <>
              <span className="overview-hero-chip">组织 {company.orgId}</span>
              <span className="overview-hero-chip">成员 {company.memberCount}</span>
              <span className="overview-hero-chip">Skills {company.orgSkillCount}</span>
              {company.recentPolicyDenyCount > 0 ? (
                <span className="overview-hero-chip warn">策略拒绝 {company.recentPolicyDenyCount}</span>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link to="/org-config">企业设置</Link>
              </Button>
            </>
          ) : null}
          {primaryCta ? (
            <Button asChild size="sm">
              <Link to={primaryCta.to}>{primaryCta.label}</Link>
            </Button>
          ) : null}
          {!company && connected > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/team">登录</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={props.onRefresh}>
            {t("common.refresh")}
          </Button>
        </div>
      </header>

      <section className="overview-stat-strip" data-overview-section="capability" aria-label="能力状态">
        <StatCell
          icon={Cable}
          label="连接器"
          value={`${connected}/${totalProviders}`}
          hint={connected > 0 ? `${connPct}% 已连接` : "优先完成这一步"}
          tone={connected > 0 ? "ok" : "action"}
          to="/connections"
        />
        <StatCell
          icon={Wrench}
          label="可执行操作"
          value={formatNum(executable)}
          hint={connected > 0 ? "已可外发调用" : "连接后才能真正外发"}
          tone={connected > 0 && executable > 0 ? "ok" : "muted"}
          to="/connections"
        />
        <StatCell
          icon={Activity}
          label="工具调用"
          value={formatNum(toolRuns)}
          hint={toolRuns > 0 ? `成功 ${usage?.okRuns ?? 0}` : "尚无 Gateway 调用"}
          tone={toolRuns > 0 ? "ok" : "muted"}
          to="/metering"
        />
        <StatCell
          icon={Waypoints}
          label="模型边车"
          value={routerOk ? "在线" : routerDown ? "离线" : "—"}
          hint={llmUsage?.ok ? `${formatNum(llmUsage.totalTokens)} tokens` : routerOk ? "OmniRoute 可达" : "需启动边车"}
          tone={routerOk ? "ok" : routerDown ? "warn" : "muted"}
          href={dashboardUrl}
          external
        />
      </section>

      <section className="overview-ledgers" data-overview-section="observability">
        <article className={`overview-ledger is-model${routerOk ? " is-live" : ""}`} data-obs-plane="model">
          <div className="overview-ledger-head">
            <div className="overview-ledger-identity">
              <span className="overview-ledger-icon is-model">
                <Waypoints size={18} />
              </span>
              <div>
                <div className="overview-ledger-kicker">模型账 · OmniRoute</div>
                <h2 className="overview-ledger-title">聊天 / token / 限流</h2>
              </div>
            </div>
            <StatusPill ok={routerOk} warn={routerDown} okLabel="在线" warnLabel="离线" idleLabel="未探测" />
          </div>

          {llmUsage?.ok ? (
            <div className="overview-ledger-metrics">
              <MiniMetric label="请求" value={formatNum(llmUsage.totalRequests)} />
              <MiniMetric label="Tokens" value={formatNum(llmUsage.totalTokens)} />
              <MiniMetric label="估算" value={formatCost(llmUsage.totalCost)} />
              <MiniMetric label="模型" value={String(llmUsage.byModel?.length ?? 0)} />
            </div>
          ) : (
            <p className="overview-ledger-copy">
              {routerDown ? "边车未连接，启动后可看 LLM 用量。" : "密钥与路由在边车，详细账单进看板。"}
            </p>
          )}

          {routerDown ? (
            <p className="overview-ledger-hint">
              <code>npm run dev:omniroute</code>
            </p>
          ) : null}

          <div className="overview-ledger-actions">
            <Button asChild size="sm">
              <a href={dashboardUrl} target="_blank" rel="noreferrer">
                模型看板 <ExternalLink size={14} />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/metering">计量 · LLM</Link>
            </Button>
          </div>
        </article>

        <article className="overview-ledger is-tools" data-obs-plane="tools">
          <div className="overview-ledger-head">
            <div className="overview-ledger-identity">
              <span className="overview-ledger-icon is-tools">
                <Gauge size={18} />
              </span>
              <div>
                <div className="overview-ledger-kicker">工具账 · OnMyCompany</div>
                <h2 className="overview-ledger-title">外发 / 成员 / 策略</h2>
              </div>
            </div>
            <StatusPill ok={toolRuns > 0} okLabel={`${toolRuns} 次`} idleLabel="待产生" />
          </div>

          {toolRuns > 0 && usage ? (
            <div className="overview-ledger-metrics">
              <MiniMetric label="成功" value={formatNum(usage.okRuns)} />
              <MiniMetric label="失败" value={formatNum(usage.failedRuns)} />
              <MiniMetric label="服务" value={String(usage.byService?.length ?? 0)} />
              <MiniMetric label="成员" value={String(usage.byMember?.length ?? 0)} />
            </div>
          ) : (
            <p className="overview-ledger-copy">
              {connected === 0
                ? "连接应用后，用 MCP 或 token 调用会出现在这里。"
                : "跑过 Action 后显示成功/失败与排行。"}
            </p>
          )}

          <div className="overview-ledger-actions">
            {connected === 0 ? (
              <Button asChild size="sm">
                <Link to="/connections">去连接</Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link to="/metering">
                <Gauge size={14} /> 计量
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/runs">
                <Activity size={14} /> 运行
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/audit-events">
                <Shield size={14} /> 审计
              </Link>
            </Button>
          </div>
        </article>
      </section>

      <section className="console-card overview-activity-card" data-overview-section="team-usage">
        <div className="console-card-header">
          <div>
            <h2 className="console-card-title">最近活动</h2>
            <p className="console-card-subtitle">工具调用排行 · LLM 见模型账</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/metering">
              计量 <ArrowUpRight size={14} />
            </Link>
          </Button>
        </div>

        {!token ? (
          <div className="overview-empty-cta is-quiet">
            <CircleDashed size={18} />
            <div className="overview-empty-copy">
              <strong>登录后显示团队用量</strong>
              <p>邮箱 OTP 登录即可，不阻塞连接应用。</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/team">登录</Link>
            </Button>
          </div>
        ) : toolRuns === 0 ? (
          <div className="overview-empty-cta is-quiet">
            <Sparkles size={18} />
            <div className="overview-empty-copy">
              <strong>还没有工具调用</strong>
              <p>连上应用后用 MCP 或 runtime token 跑一次。</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/connections">连接器</Link>
            </Button>
          </div>
        ) : (
          <div className="overview-activity-cols" data-overview-section="personal-usage">
            <ActivityCol
              title="按服务"
              rows={(usage?.byService || []).slice(0, 6).map((r) => ({
                label: r.service,
                value: String(r.count),
              }))}
            />
            <ActivityCol
              title="按成员"
              rows={(usage?.byMember || []).slice(0, 6).map((r) => ({
                label: shortId(r.memberId),
                value: String(r.count),
              }))}
            />
          </div>
        )}
        {toolRuns === 0 ? <div hidden data-overview-section="personal-usage" /> : null}
      </section>
    </div>
  );
}

function StatCell(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "warn" | "muted" | "action";
  to?: string;
  href?: string;
  external?: boolean;
}): ReactNode {
  const Icon = props.icon;
  const className = `overview-stat-cell is-${props.tone}`;
  const inner = (
    <>
      <div className="overview-stat-top">
        <Icon size={15} />
        <span>{props.label}</span>
      </div>
      <div className="overview-stat-value">{props.value}</div>
      <div className="overview-stat-hint">{props.hint}</div>
    </>
  );
  if (props.external && props.href) {
    return (
      <a className={className} href={props.href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  if (props.to) {
    return (
      <Link className={className} to={props.to}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

function StatusPill(props: {
  ok?: boolean;
  warn?: boolean;
  okLabel: string;
  warnLabel?: string;
  idleLabel?: string;
}): ReactNode {
  if (props.ok) return <span className="overview-cap-badge is-ok">{props.okLabel}</span>;
  if (props.warn) return <span className="overview-cap-badge is-warn">{props.warnLabel || "异常"}</span>;
  return <span className="overview-cap-badge">{props.idleLabel || "—"}</span>;
}

function MiniMetric(props: { label: string; value: string }): ReactNode {
  return (
    <div className="overview-mini-metric">
      <div className="overview-mini-label">{props.label}</div>
      <div className="overview-mini-value">{props.value}</div>
    </div>
  );
}

function ActivityCol(props: { title: string; rows: Array<{ label: string; value: string }> }): ReactNode {
  return (
    <div className="overview-activity-col">
      <div className="overview-activity-col-title">{props.title}</div>
      {props.rows.length === 0 ? (
        <div className="console-empty" style={{ padding: 16 }}>
          暂无
        </div>
      ) : (
        props.rows.map((r) => (
          <div key={r.label} className="overview-activity-row">
            <span className="mono">{r.label}</span>
            <strong className="tabular-nums">{r.value}</strong>
          </div>
        ))
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
