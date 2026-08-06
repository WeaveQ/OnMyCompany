import type { AppLang } from "./i18n";
import type {
  AppData,
  ConnectionRecord,
  OAuthConfig,
  ProviderDefinition,
  RunLogPage,
  RuntimePolicyState,
  RuntimeTokenSummary,
} from "./model";
import type { TeamRecord } from "./team-ui";
import type { ThemeMode } from "./theme";
import type { FormEvent, ReactNode } from "react";

import { useI18n, useLang, useTranslate } from "@embra/i18n/react";
import {
  Activity,
  BookOpen,
  Cable,
  Gauge,
  Home,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ExternalLink,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  TerminalSquare,
  UserRound,
  Users,
  Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { AccessPage } from "./access-page";
import { ActionsPage } from "./actions-page";
import { ApiError, apiGet, apiPost } from "./api";
import oomolConnectLogoUrl from "./assets/oomol-connect-logo.png";
import { AuditEventsPage } from "./audit-events-page";
import { ConnectionsPage } from "./connections-page";
import { persistLang, supportedLangs } from "./i18n";
import {
  ensureMemberSessionForConsole,
  getActiveTeamId,
  memberAuthHeaders,
  setActiveTeamId as persistActiveTeamId,
} from "./member-session";
import { MembersPage } from "./members-page";
import { MeteringPage } from "./metering-page";
import { emptyData } from "./model";
import { OrgConfigPage } from "./org-config-page";
import { OrgTeamsPage } from "./org-teams-page";
import { OverviewPage } from "./overview-page";
import { ProvidersPage } from "./providers-page";
import { ResourcesPage } from "./resources-page";
import { RunsPage } from "./runs-page";
import { InlineError } from "./shared-ui";
import { SkillsPage } from "./skills-page";
import { CreateTeamModal, TeamManagePage, TeamSwitcher } from "./team-manage-page";
import { ALL_TEAMS_ID, resolveActiveTeamId, teamNavTarget } from "./team-ui";
import { useThemeMode } from "./theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type NavItem = {
  path: string;
  labelKey: string;
  icon: typeof Home;
};

type NavGroup = {
  /** i18n key for small section label; omit for unlabeled primary group */
  labelKey?: string;
  items: readonly NavItem[];
};

/**
 * Sidebar IA — grouped with dividers (not a flat dump).
 *
 * 1. 工作台：概览 / 企业账号 / 团队
 *    「团队」= 本队成员；全公司上下文或页内「全部团队」→ 团队列表（/org/teams，不进侧栏）
 * 2. 观测：用量 / 运行 / 审计
 * 3. 能力：应用连接（企业共享）/ Skills / 接入凭证
 * 4. 配置：企业设置 / 文档（模型路由单独外链）
 *
 * 操作 (/actions) 不进侧栏：从「应用连接」行内深链进入。
 */
const navGroups: readonly NavGroup[] = [
  {
    items: [
      { path: "/overview", labelKey: "nav.overview", icon: Home },
      { path: "/members", labelKey: "nav.members", icon: UserRound },
      { path: "/team", labelKey: "nav.team", icon: Users },
    ],
  },
  {
    labelKey: "nav.group.observability",
    items: [
      { path: "/metering", labelKey: "nav.metering", icon: Gauge },
      { path: "/runs", labelKey: "nav.runs", icon: Activity },
      { path: "/audit-events", labelKey: "nav.auditEvents", icon: Shield },
    ],
  },
  {
    labelKey: "nav.group.capability",
    items: [
      { path: "/connections", labelKey: "nav.connections", icon: Cable },
      { path: "/skills", labelKey: "nav.skills", icon: Sparkles },
      { path: "/access", labelKey: "nav.access", icon: KeyRound },
    ],
  },
  {
    labelKey: "nav.group.config",
    items: [
      { path: "/org-config", labelKey: "nav.orgConfig", icon: Settings2 },
      { path: "/resources", labelKey: "nav.docs", icon: BookOpen },
    ],
  },
] as const;

const primaryNavItems = navGroups[0]!.items;
const secondaryNavItems = navGroups.slice(1).flatMap((g) => [...g.items]);
const navItems = [...primaryNavItems, ...secondaryNavItems] as const;

/** Routes kept reachable but not listed in sidebar (header icon only). */
const shellOnlyNavItems = [{ path: "/actions", labelKey: "nav.actions", icon: TerminalSquare }] as const;

/** Exported for IA tests: primary peer paths only. */
export function getPrimaryNavPaths(): string[] {
  return primaryNavItems.map((item) => item.path);
}

/** Exported for IA tests: secondary sidebar paths (formerly under「更多」). */
export function getMoreNavPaths(): string[] {
  return secondaryNavItems.map((item) => item.path);
}

const oauthCompletionChannelName = "onmycompany-oauth";
const oauthCompletedType = "oauth.completed";

const themeOptions = [
  { value: "auto", labelKey: "shell.themeMode.auto", icon: Monitor },
  { value: "light", labelKey: "shell.themeMode.light", icon: Sun },
  { value: "dark", labelKey: "shell.themeMode.dark", icon: Moon },
] as const;

export interface AuthSession {
  adminAuthConfigured: boolean;
  authenticated: boolean;
}

export interface OAuthCompletionMessage {
  type: typeof oauthCompletedType;
  service: string;
}

export function subscribeToOAuthCompletions(onComplete: (message: OAuthCompletionMessage) => void): () => void {
  const handleMessage = (event: MessageEvent<unknown>): void => {
    if (isOAuthCompletionMessage(event.data)) {
      onComplete(event.data);
    }
  };

  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  const channel = new BroadcastChannel(oauthCompletionChannelName);
  channel.addEventListener("message", handleMessage);
  return () => channel.close();
}

function isOAuthCompletionMessage(value: unknown): value is OAuthCompletionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as { type?: unknown; service?: unknown };
  return message.type === oauthCompletedType && typeof message.service === "string";
}

export interface LogoutState {
  authSession: AuthSession;
}

export function nextLogoutState(state: LogoutState, succeeded: boolean): LogoutState {
  return succeeded
    ? {
        authSession: { ...state.authSession, authenticated: false },
      }
    : state;
}

export interface AuthLoadState {
  pendingUnlockToken: string;
  authSession: AuthSession;
  locked: boolean;
}

export function nextAuthLoadState(state: AuthLoadState, session: AuthSession): AuthLoadState {
  return {
    pendingUnlockToken: session.authenticated ? "" : state.pendingUnlockToken,
    authSession: session,
    locked: !session.authenticated,
  };
}

export interface RuntimeLoadResult {
  authSession: AuthSession;
  data: AppData;
}

/**
 * Loads dashboard state.
 *
 * The provider catalog is generated at build time and cannot change while the
 * server runs, so `cachedProviders` lets refreshes skip re-downloading it and
 * re-fetch only mutable data.
 */
export async function loadRuntimeData(
  unlockToken: string,
  cachedProviders?: ProviderDefinition[],
): Promise<RuntimeLoadResult> {
  const authSession = await apiGet<AuthSession>("/api/auth/session", { bearerToken: unlockToken });
  if (!authSession.authenticated) {
    return { authSession, data: emptyData };
  }

  const catalogRequest =
    cachedProviders !== undefined ? Promise.resolve(cachedProviders) : apiGet<ProviderDefinition[]>("/api/providers");

  const [providers, connections, oauthConfigs, runtimeTokens, runtimePolicy, runPage] = await Promise.all([
    catalogRequest,
    apiGet<ConnectionRecord[]>("/api/connections"),
    apiGet<OAuthConfig[]>("/api/oauth/configs"),
    apiGet<RuntimeTokenSummary[]>("/api/runtime-tokens"),
    apiGet<RuntimePolicyState>("/api/runtime-policy"),
    apiGet<RunLogPage>("/api/runs"),
  ]);

  return {
    authSession,
    data: {
      providers,
      connections,
      oauthConfigs,
      runtimeTokens,
      runtimePolicy,
      runs: runPage.items,
      runsNextCursor: runPage.nextCursor,
    },
  };
}

export function App(): ReactNode {
  const t = useTranslate();
  const { theme, setTheme } = useThemeMode();
  const [data, setData] = useState<AppData>(emptyData);
  const [authSession, setAuthSession] = useState<AuthSession>({
    adminAuthConfigured: false,
    authenticated: true,
  });
  const pendingUnlockToken = useRef("");
  // Catalog is immutable while the server runs, so it is fetched once and
  // reused across refreshes instead of being re-downloaded on every action.
  const cachedProviders = useRef<ProviderDefinition[] | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(
    () =>
      subscribeToOAuthCompletions(() => {
        setRefreshToken((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const requestUnlockToken = pendingUnlockToken.current;
    setLoading(true);
    loadRuntimeData(requestUnlockToken, cachedProviders.current)
      .then(({ authSession: session, data: nextData }) => {
        if (!cancelled) {
          cachedProviders.current = session.authenticated ? nextData.providers : undefined;
          const nextAuth = nextAuthLoadState(
            {
              pendingUnlockToken: pendingUnlockToken.current,
              authSession,
              locked,
            },
            session,
          );
          pendingUnlockToken.current = nextAuth.pendingUnlockToken;
          setData(nextData);
          setAuthSession(nextAuth.authSession);
          setLocked(nextAuth.locked);
          setError(session.authenticated ? null : requestUnlockToken.trim() ? t("shell.invalidUnlockToken") : null);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          pendingUnlockToken.current = "";
          cachedProviders.current = undefined;
          setData(emptyData);
          setAuthSession({ adminAuthConfigured: true, authenticated: false });
          setLocked(true);
          setError(requestUnlockToken.trim() ? t("shell.invalidUnlockToken") : null);
          return;
        }
        setError(caught instanceof Error ? caught.message : t("shell.loadRuntimeFailed"));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRuntimeChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken, t]);

  function refresh(): void {
    setRefreshToken((value) => value + 1);
  }

  function unlock(token: string): void {
    pendingUnlockToken.current = token;
    setLoading(true);
    refresh();
  }

  function logout(): void {
    void apiPost("/api/auth/logout", {})
      .then(() => {
        const next = nextLogoutState({ authSession }, true);
        setAuthSession(next.authSession);
        setError(null);
        refresh();
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : t("shell.logoutFailed"));
      });
  }

  if (locked) {
    return <UnlockView loading={loading} message={error} theme={theme} onThemeChange={setTheme} onUnlock={unlock} />;
  }

  if (!runtimeChecked) {
    return <InitialLoadingView />;
  }

  return (
    <AppShell
      data={data}
      showLogout={authSession.adminAuthConfigured && authSession.authenticated}
      loading={loading}
      error={error}
      theme={theme}
      onRefresh={refresh}
      onThemeChange={setTheme}
      onLogout={logout}
    />
  );
}

function InitialLoadingView(): ReactNode {
  const t = useTranslate();

  return (
    <main className="unlock-screen">
      <div className="loading-panel">
        <Loader2 className="spin" size={16} />
        {t("common.loadingRuntimeData")}
      </div>
    </main>
  );
}

function AppShell(props: {
  data: AppData;
  showLogout: boolean;
  loading: boolean;
  error: string | null;
  theme: ThemeMode;
  onRefresh(): void;
  onThemeChange(theme: ThemeMode): void;
  onLogout(): void;
}): ReactNode {
  const t = useTranslate();
  const location = useLocation();
  const navigate = useNavigate();
  const heading = headingForPath(location.pathname);
  const section = location.pathname.split("/").filter(Boolean)[0];
  const isOverviewPage = heading === "overview";
  const isBrowserPage = section === "actions" || section === "runs";
  const isRunsPage = section === "runs";
  const isConnectionsPage = section === "connections";
  const mainClassName = [
    isBrowserPage ? "main main-browser" : "main",
    isOverviewPage ? "overview-main" : "",
    isRunsPage ? "runs-main" : "",
    isConnectionsPage ? "connections-main" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const currentNavItem =
    [...navItems, ...shellOnlyNavItems].find(
      (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
    ) ?? navItems[0];
  const CurrentNavIcon = currentNavItem.icon;

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>(() => getActiveTeamId());
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [elevatedTeamView, setElevatedTeamView] = useState(false);

  /** Switch team: persist + event, sync /team URL, refresh gateway + team-scoped pages. */
  const selectTeam = useCallback(
    (id: string) => {
      if (!id) return;
      if (id === activeTeamId) {
        persistActiveTeamId(id);
        return;
      }
      setActiveTeamId(id);
      persistActiveTeamId(id);
      if (id === ALL_TEAMS_ID) {
        // 全公司：团队菜单落到「团队列表」；不绑单一 membership 资源
        if (
          location.pathname === "/team" ||
          location.pathname.startsWith("/team/") ||
          location.pathname === "/org/teams"
        ) {
          navigate("/org/teams", { replace: true });
        }
        props.onRefresh();
        return;
      }
      if (location.pathname === "/team" || location.pathname.startsWith("/team/")) {
        const next = new URLSearchParams(location.search);
        next.set("team", id);
        navigate({ pathname: "/team", search: `?${next.toString()}` }, { replace: true });
      }
      props.onRefresh();
    },
    [activeTeamId, location.pathname, location.search, navigate, props],
  );

  const refreshTeams = useCallback(async () => {
    try {
      // Console already open → silent org-admin session so 成员/团队不二次登录
      await ensureMemberSessionForConsole();
      let elevated = false;
      try {
        const me = await apiGet<{ roles?: string[] }>("/api/me", memberAuthHeaders());
        elevated = Boolean(me.roles?.includes("admin") || me.roles?.includes("auditor"));
      } catch {
        elevated = false;
      }
      setElevatedTeamView(elevated);
      const list = await apiGet<{ items: TeamRecord[] }>(
        elevated ? "/api/teams?scope=all" : "/api/teams",
        memberAuthHeaders(),
      );
      setTeams(list.items ?? []);
      const nextId = resolveActiveTeamId(list.items ?? [], activeTeamId);
      if (!nextId) return;
      if (nextId !== activeTeamId) {
        setActiveTeamId(nextId);
        persistActiveTeamId(nextId);
      } else if (getActiveTeamId() !== nextId) {
        persistActiveTeamId(nextId);
      }
    } catch {
      // Unauthenticated or company routes unavailable — leave empty until member login.
      setTeams([]);
      setElevatedTeamView(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams, props.data]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={oomolConnectLogoUrl} alt="" />
          <div>
            <div className="brand-name">OnMyCompany</div>
            <div className="brand-subtitle">{t("brand.subtitle")}</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("shell.primaryNav")}>
          {navGroups.map((group, groupIndex) => (
            <div key={group.labelKey ?? `nav-group-${groupIndex}`} className="sidebar-nav-group">
              {groupIndex > 0 ? <div className="sidebar-nav-divider" aria-hidden /> : null}
              {group.labelKey ? <div className="sidebar-nav-label">{t(group.labelKey)}</div> : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                // 「团队」must never open with ALL_TEAMS_ID as the resource id.
                const to = item.path === "/team" ? teamNavTarget(activeTeamId, teams) : item.path;
                return (
                  <NavLink
                    key={item.path}
                    className={({ isActive }) => {
                      // Membership + directory share one sidebar item.
                      const teamSection =
                        item.path === "/team" &&
                        (location.pathname === "/team" ||
                          location.pathname.startsWith("/team/") ||
                          location.pathname === "/org/teams");
                      return isActive || teamSection ? "nav-item active" : "nav-item";
                    }}
                    to={to}
                  >
                    <Icon size={16} />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}

          <div className="sidebar-nav-group">
            <div className="sidebar-nav-divider" aria-hidden />
            <div className="sidebar-nav-label">{t("nav.group.external")}</div>
            <ModelRouterNavLink label={t("nav.modelRouter")} />
          </div>
        </nav>

        {/*
          OOMOL footer: ONE row — [avatar name ↕] | [⚙]
          Click name/chevron → team switcher. Click gear → settings (not the dropdown).
        */}
        <div className="sidebar-footer">
          <div className="footer-identity">
            <TeamSwitcher
              teams={teams}
              activeTeamId={activeTeamId}
              showAllTeams={elevatedTeamView}
              onSelect={selectTeam}
              onCreate={() => setCreateTeamOpen(true)}
              onManage={() => {
                navigate(teamNavTarget(activeTeamId, teams));
              }}
            />
            <AccountMenu
              showLogout={props.showLogout}
              loading={props.loading}
              error={props.error}
              theme={props.theme}
              onRefresh={props.onRefresh}
              onThemeChange={props.onThemeChange}
              onLogout={props.onLogout}
              onOpenOrgConfig={() => navigate("/org-config")}
              onOpenSupport={() => navigate("/resources")}
            />
          </div>
        </div>
      </aside>

      <CreateTeamModal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        onCreated={(team) => {
          setTeams((prev) => [...prev, team]);
          setActiveTeamId(team.id);
          persistActiveTeamId(team.id);
          navigate(`/team?team=${encodeURIComponent(team.id)}`);
          props.onRefresh();
        }}
      />

      <div className={isBrowserPage ? "main-region main-region-browser" : "main-region"}>
        <header className="shell-header">
          <div className="shell-header-title">
            <CurrentNavIcon size={16} />
            <h1>{t(`shell.headings.${heading}.title`)}</h1>
          </div>
          {props.loading ? (
            <div className="loading-panel page-loading">
              <Loader2 className="spin" size={16} />
              {t("common.loadingRuntimeData")}
            </div>
          ) : null}
        </header>

        <main className={mainClassName}>
          {props.error ? <InlineError message={props.error} /> : null}

          <Routes>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route
              path="/overview"
              element={<OverviewPage data={props.data} onRefresh={props.onRefresh} activeTeamId={activeTeamId} />}
            />
            <Route path="/providers" element={<ProvidersPage data={props.data} onRefresh={props.onRefresh} />} />
            <Route
              path="/providers/:service"
              element={<ProvidersPage data={props.data} onRefresh={props.onRefresh} />}
            />
            <Route path="/actions" element={<ActionsPage data={props.data} onRefresh={props.onRefresh} />} />
            <Route path="/actions/:actionId" element={<ActionsPage data={props.data} onRefresh={props.onRefresh} />} />
            <Route path="/org-config" element={<OrgConfigPage />} />
            <Route path="/metering" element={<MeteringPage activeTeamId={activeTeamId} />} />
            <Route path="/audit-events" element={<AuditEventsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/org/teams" element={<OrgTeamsPage />} />
            <Route path="/team" element={<TeamManagePage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/connections" element={<ConnectionsPage data={props.data} onRefresh={props.onRefresh} />} />
            <Route
              path="/runs"
              element={<RunsPage initialRuns={props.data.runs} nextCursor={props.data.runsNextCursor} />}
            />
            <Route
              path="/access"
              element={
                <AccessPage
                  providers={props.data.providers}
                  tokens={props.data.runtimeTokens}
                  policy={props.data.runtimePolicy ?? emptyData.runtimePolicy!}
                  onRefresh={props.onRefresh}
                />
              }
            />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export interface UnlockViewProps {
  loading: boolean;
  message: string | null;
  theme: ThemeMode;
  onThemeChange(theme: ThemeMode): void;
  onUnlock(token: string): void;
}

/** External link to OmniRoute dashboard (B+D model-plane sidecar). */
function ModelRouterNavLink(props: { label: string }): ReactNode {
  const [href, setHref] = useState("http://127.0.0.1:20128/dashboard");
  const [status, setStatus] = useState<"unknown" | "up" | "down">("unknown");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const health = await apiGet<{
          modelRouter?: { dashboardUrl?: string; ok?: boolean | null; enabled?: boolean };
        }>("/api/company/health");
        if (cancelled) return;
        const mr = health.modelRouter;
        if (mr?.dashboardUrl) setHref(mr.dashboardUrl);
        if (mr?.enabled === false) setStatus("unknown");
        else if (mr?.ok === true) setStatus("up");
        else if (mr?.ok === false) setStatus("down");
      } catch {
        if (!cancelled) setStatus("down");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      className="nav-item"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={
        status === "up"
          ? "OmniRoute reachable"
          : status === "down"
            ? "OmniRoute offline — npm run dev:omniroute"
            : "Open OmniRoute model router"
      }
      data-testid="nav-model-router"
      data-status={status}
    >
      <Waypoints size={16} />
      <span>{props.label}</span>
      <ExternalLink size={12} style={{ marginLeft: "auto", opacity: 0.55 }} />
    </a>
  );
}

export function UnlockView(props: UnlockViewProps): ReactNode {
  const t = useTranslate();
  const [token, setToken] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    props.onUnlock(token.trim());
  }

  return (
    <main className="unlock-screen">
      <section className="unlock-panel">
        <div className="brand">
          <img className="brand-mark" src={oomolConnectLogoUrl} alt="" />
          <div>
            <div className="brand-name">OnMyCompany</div>
            <div className="brand-subtitle">{t("brand.adminAccess")}</div>
          </div>
        </div>
        <LanguageSelect />
        <ThemeControl theme={props.theme} onThemeChange={props.onThemeChange} />
        <form className="form-grid" onSubmit={submit}>
          <Label className="field">
            <span>{t("unlock.token")}</span>
            <Input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </Label>
          <Button
            className="unlock-submit"
            type="submit"
            data-loading={props.loading}
            aria-busy={props.loading}
            disabled={!token.trim() || props.loading}
          >
            <span className="unlock-button-slot">
              <Loader2
                className={props.loading ? "unlock-button-spinner spin" : "unlock-button-spinner idle"}
                size={16}
                aria-hidden="true"
              />
            </span>
            <span>{t("unlock.unlockConsole")}</span>
            <span className="unlock-button-slot" aria-hidden="true" />
          </Button>
        </form>
        {props.message ? (
          <div className="unlock-status" aria-live="polite">
            <InlineError message={props.message} />
          </div>
        ) : null}
      </section>
    </main>
  );
}

const SUPPORT_EMAIL = "support@onmycompany.com";

/** Settings popover opened by the gear on the right of the team name (OOMOL). */
function AccountMenu(props: {
  showLogout: boolean;
  loading: boolean;
  error: string | null;
  theme: ThemeMode;
  onRefresh(): void;
  onThemeChange(theme: ThemeMode): void;
  onLogout(): void;
  onOpenOrgConfig(): void;
  onOpenSupport(): void;
}): ReactNode {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const identity = t("shell.account.admin");

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (rootRef.current?.contains(target)) {
        return;
      }
      // Language Select content is portaled; keep the menu open while using it.
      if (
        target instanceof Element &&
        target.closest("[data-slot='select-content'], [data-radix-select-content], [role='listbox']")
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      {/* Gear only — sits to the right of team name, not a second identity row */}
      <button
        type="button"
        className={`footer-gear${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("shell.account.settings")}
        title={t("shell.account.settings")}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={16} strokeWidth={1.75} />
      </button>

      {open ? (
        <div className="account-menu-popover" role="menu">
          <div className="account-menu-header">
            <div className="account-menu-identity-label">{t("shell.account.signedInAs")}</div>
            <div className="account-menu-identity">{identity}</div>
          </div>

          <div className="account-menu-section">
            <button
              type="button"
              role="menuitem"
              className="account-menu-item"
              onClick={() => {
                setOpen(false);
                props.onOpenOrgConfig();
              }}
            >
              <Settings2 size={15} strokeWidth={1.85} className="account-menu-item-icon" />
              <span>{t("shell.account.settings")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="account-menu-item"
              disabled={props.loading}
              onClick={() => {
                props.onRefresh();
              }}
            >
              {props.loading ? (
                <Loader2 className="spin account-menu-item-icon" size={15} />
              ) : (
                <RefreshCw size={15} strokeWidth={1.85} className="account-menu-item-icon" />
              )}
              <span>{t("shell.refreshData")}</span>
            </button>
          </div>

          <div className="account-menu-divider" />

          <div className="account-menu-section account-menu-prefs">
            <div className="account-menu-inline-row" role="none">
              <span className="account-menu-inline-label">
                <Languages size={15} strokeWidth={1.85} className="account-menu-item-icon" />
                <span>{t("language.label")}</span>
              </span>
              <LanguageSelect compact />
            </div>
            <div className="account-menu-inline-row" role="none">
              <span className="account-menu-inline-label">
                <Palette size={15} strokeWidth={1.85} className="account-menu-item-icon" />
                <span>{t("shell.theme")}</span>
              </span>
              <ThemeControl compact theme={props.theme} onThemeChange={props.onThemeChange} />
            </div>
          </div>

          {props.showLogout ? (
            <>
              <div className="account-menu-divider" />
              <div className="account-menu-section">
                <button
                  type="button"
                  role="menuitem"
                  className="account-menu-item account-menu-item-danger"
                  onClick={() => {
                    setOpen(false);
                    props.onLogout();
                  }}
                >
                  <LogOut size={15} strokeWidth={1.85} className="account-menu-item-icon" />
                  <span>{t("shell.logout")}</span>
                </button>
              </div>
            </>
          ) : null}

          <div className="account-menu-divider" />
          <div className="account-menu-section">
            <a
              role="menuitem"
              className="account-menu-item account-menu-item-muted account-menu-support"
              href={`mailto:${SUPPORT_EMAIL}`}
              title={SUPPORT_EMAIL}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                props.onOpenSupport();
              }}
            >
              <Mail size={15} strokeWidth={1.85} className="account-menu-item-icon" />
              <span className="account-menu-support-email">{SUPPORT_EMAIL}</span>
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThemeControl(props: {
  theme: ThemeMode;
  onThemeChange(theme: ThemeMode): void;
  compact?: boolean;
}): ReactNode {
  const t = useTranslate();

  return (
    <div className={props.compact ? "theme-control compact" : "theme-control"} aria-label={t("shell.theme")}>
      {props.compact ? null : <span>{t("shell.theme")}</span>}
      <div className="theme-segmented-control" role="radiogroup" aria-label={t("shell.theme")}>
        {themeOptions.map((item) => {
          const Icon = item.icon;
          const selected = props.theme === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className={selected ? "theme-segment active" : "theme-segment"}
              role="radio"
              aria-checked={selected}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
              onClick={() => props.onThemeChange(item.value)}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LanguageSelect(props: { compact?: boolean } = {}): ReactNode {
  const t = useTranslate();
  const i18n = useI18n();
  const lang = useLang() as AppLang;

  function switchLang(nextLang: AppLang): void {
    persistLang(nextLang);
    void i18n.switchLang(nextLang);
  }

  return (
    <div className={props.compact ? "language-select compact" : "language-select"}>
      {props.compact ? null : <span className="language-select-label">{t("language.label")}</span>}
      <Select value={lang} onValueChange={(value) => switchLang(value as AppLang)}>
        <SelectTrigger className="language-select-trigger" size="sm" aria-label={t("language.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="language-select-content" position="popper" align="end">
          {supportedLangs.map((item) => (
            <SelectItem key={item} value={item}>
              {t(`language.${item}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function headingForPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0];
  if (section === "org" && parts[1] === "teams") {
    return "orgTeams";
  }
  if (section === "org-config") {
    return "orgConfig";
  }
  if (section === "skills") {
    return "skills";
  }
  if (section === "metering") {
    return "metering";
  }
  if (section === "audit-events") {
    return "auditEvents";
  }
  if (section === "connections") {
    return "connections";
  }
  if (section === "members") {
    return "members";
  }
  if (section === "team") {
    return "team";
  }
  if (section === "providers") {
    return "providers";
  }
  if (section === "actions") {
    return "actions";
  }
  if (section === "runs") {
    return "runs";
  }
  if (section === "access") {
    return "access";
  }
  if (section === "resources") {
    return "resources";
  }
  if (section === "overview" || !section) {
    return "overview";
  }
  return "overview";
}

/** Exported for IA tests: shell top bar title key. */
export function getShellHeadingKey(pathname: string): string {
  return headingForPath(pathname);
}
