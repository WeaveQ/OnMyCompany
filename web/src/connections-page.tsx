import type { AppData, ProviderConnectionStatus, ProviderDefinition } from "./model";
import type { CSSProperties, ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ArrowUpDown, ChevronRight, ListFilter, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiGet, apiPut } from "./api";
import { memberAuthHeaders } from "./member-session";
import { filterProviders, resolveProviderConnectionStatus, sortProviders } from "./model";
import { isProviderLocallyAvailable } from "./providers-page";
import { ProviderIcon } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ConnectionsPageProps {
  data: AppData;
  onRefresh(): void;
}

/** Status chips: all / configured / needs_attention / ready */
type StatusFilter = "all" | "configured" | "needs_attention" | "ready";

/**
 * Primary + overflow category chips. Values match catalog English tags.
 */
type CategoryFilter =
  | "all"
  | "AI"
  | "Productivity"
  | "Documents"
  | "Developer Tools"
  | "Marketing"
  | "Communication"
  | "DataStorage"
  | "Other";

const pageSize = 48;

/** Structural status order (labels come from i18n). */
export const CONNECTION_STATUS_IDS = ["all", "configured", "needs_attention", "ready"] as const;

/** English source labels (UI uses i18n via connectionsPage.status*). */
export const CONNECTION_STATUS_LABELS = ["All", "Configured", "Needs attention", "Ready to use"] as const;

const statusOptionIds: StatusFilter[] = ["all", "configured", "needs_attention", "ready"];

const primaryCategoryIds: CategoryFilter[] = ["AI", "Productivity", "Communication", "Documents", "Developer Tools"];

const moreCategoryIds: CategoryFilter[] = ["Marketing", "DataStorage", "Other"];

const allCategoryIds = [...primaryCategoryIds, ...moreCategoryIds];

const compactNumber = Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const rowStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "56px",
} satisfies CSSProperties;

type SortMode = "recommended" | "name";

function statusLabelKey(id: StatusFilter): string {
  if (id === "all") return "connectionsPage.statusAll";
  if (id === "configured") return "connectionsPage.statusConfigured";
  if (id === "needs_attention") return "connectionsPage.statusNeedsAttention";
  return "connectionsPage.statusReady";
}

function categoryLabelKey(id: CategoryFilter): string {
  switch (id) {
    case "AI":
      return "connectionsPage.categoryAI";
    case "Productivity":
      return "connectionsPage.categoryProductivity";
    case "Communication":
      return "connectionsPage.categoryCommunication";
    case "Documents":
      return "connectionsPage.categoryDocuments";
    case "Developer Tools":
      return "connectionsPage.categoryDeveloper";
    case "Marketing":
      return "connectionsPage.categoryMarketing";
    case "DataStorage":
      return "connectionsPage.categoryDataStorage";
    case "Other":
      return "connectionsPage.categoryOther";
    default:
      return "connectionsPage.categoryOther";
  }
}

/**
 * Enterprise-shared app connections — gateway app catalog with status + category.
 */
export function ConnectionsPage(props: ConnectionsPageProps): ReactNode {
  const t = useTranslate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen && !filterMenuOpen) return;
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node | null;
      if (!target) return;
      if (moreOpen && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreOpen(false);
      }
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMoreOpen(false);
        setFilterMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterMenuOpen, moreOpen]);

  const statusByService = useMemo(
    () =>
      new Map(
        props.data.providers.map((provider) => [
          provider.service,
          resolveProviderConnectionStatus(provider, props.data.connections, props.data.oauthConfigs),
        ]),
      ),
    [props.data.connections, props.data.oauthConfigs, props.data.providers],
  );

  const credentialByService = useMemo(
    () =>
      new Map(
        [...statusByService.entries()].flatMap(([service, status]) =>
          status.connection ? [[service, status.connection] as const] : [],
        ),
      ),
    [statusByService],
  );

  const sorted = useMemo(() => {
    if (sortMode === "name") {
      return [...props.data.providers].sort((left, right) =>
        (left.displayName || left.service).localeCompare(right.displayName || right.service),
      );
    }
    return sortProviders(props.data.providers, credentialByService);
  }, [credentialByService, props.data.providers, sortMode]);

  const searched = useMemo(() => filterProviders(sorted, query), [sorted, query]);

  const byStatus = useMemo(
    () => searched.filter((p) => matchStatus(statusByService.get(p.service), statusFilter)),
    [searched, statusByService, statusFilter],
  );

  const visible = useMemo(() => byStatus.filter((p) => matchCategory(p, categoryFilter)), [byStatus, categoryFilter]);

  const statusCounts = useMemo(
    () =>
      statusOptionIds.map((id) => ({
        id,
        label: t(statusLabelKey(id)),
        count:
          id === "all"
            ? searched.length
            : searched.filter((p) => matchStatus(statusByService.get(p.service), id)).length,
      })),
    [searched, statusByService, t],
  );

  const categoryCounts = useMemo(() => {
    const base = byStatus;
    const counts = new Map<CategoryFilter, number>();
    for (const id of allCategoryIds) {
      counts.set(id, base.filter((p) => matchCategory(p, id)).length);
    }
    return counts;
  }, [byStatus]);

  const resetKey = `${query}|${statusFilter}|${categoryFilter}|${sortMode}`;
  const { hasMore, limit, loadMore } = useProgressiveLimit(visible.length, resetKey);
  const loadMoreRef = useIntersectionLoader(hasMore, loadMore);
  const rendered = visible.slice(0, limit);

  const filtersActive = query.trim().length > 0 || statusFilter !== "all" || categoryFilter !== "all";

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setMoreOpen(false);
    setFilterMenuOpen(false);
  }

  const moreSelected = moreCategoryIds.some((id) => id === categoryFilter);
  const moreLabel = moreSelected
    ? t(categoryLabelKey(categoryFilter === "all" ? "Other" : categoryFilter))
    : t("connectionsPage.more");
  const totalCount = searched.length;
  const shownCount = visible.length;

  return (
    <section className="connections-browser page-stack" data-connections-root>
      {/* Hero + filters stay fixed; only the provider list scrolls. */}
      <div className="connections-sticky-top">
        <header className="page-hero">
          <h1 className="page-hero-title">{t("connectionsPage.title")}</h1>
          <p className="page-hero-lead">{t("connectionsPage.lead")}</p>
        </header>
        <div className="connections-chrome">
          <div className="connections-toolbar">
            <h2 className="connections-title">{t("connectionsPage.providers")}</h2>
            <div className="connections-toolbar-actions">
              <label className="connections-search">
                <Search className="connections-search-icon" size={15} aria-hidden />
                <Input
                  className="connections-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("connectionsPage.searchPlaceholder")}
                  aria-label={t("connectionsPage.searchPlaceholder")}
                />
              </label>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="connections-tool-btn"
                onClick={() => setSortMode((mode) => (mode === "recommended" ? "name" : "recommended"))}
                aria-label={
                  sortMode === "recommended"
                    ? t("connectionsPage.sortRecommendedAria")
                    : t("connectionsPage.sortByNameAria")
                }
                title={
                  sortMode === "recommended" ? t("connectionsPage.sortRecommended") : t("connectionsPage.sortByName")
                }
              >
                <ArrowUpDown size={14} />
                <span className="connections-tool-label">
                  {sortMode === "recommended" ? t("connectionsPage.sortRecommended") : t("connectionsPage.sortByName")}
                </span>
              </Button>
              <div className="connections-menu-anchor align-end" ref={filterMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="connections-tool-btn"
                  aria-expanded={filterMenuOpen}
                  title={t("connectionsPage.moreFilters")}
                  onClick={() => {
                    setFilterMenuOpen((v) => !v);
                    setMoreOpen(false);
                  }}
                >
                  <ListFilter size={14} />
                  <span className="connections-tool-label">{t("connectionsPage.moreFilters")}</span>
                </Button>
                {filterMenuOpen ? (
                  <div className="connections-menu" role="menu">
                    <div className="connections-menu-label">{t("connectionsPage.filtersAndTools")}</div>
                    <button
                      type="button"
                      role="menuitem"
                      className="connections-menu-item"
                      onClick={() => {
                        resetFilters();
                        setFilterMenuOpen(false);
                      }}
                    >
                      {t("connectionsPage.resetFilters")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="connections-menu-item"
                      onClick={() => {
                        props.onRefresh();
                        setFilterMenuOpen(false);
                      }}
                    >
                      {t("connectionsPage.refresh")}
                    </button>
                    <div className="connections-menu-divider" />
                    <Link
                      to="/providers"
                      role="menuitem"
                      className="connections-menu-item"
                      onClick={() => setFilterMenuOpen(false)}
                    >
                      {t("connectionsPage.providerCatalogAdvanced")}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="connections-filter-bar" data-connections-status-filters data-connections-category-filters>
            <div className="connections-filter-scroll">
              <ToggleGroup
                className="connections-chip-group"
                type="single"
                value={statusFilter}
                onValueChange={(value) => (value ? setStatusFilter(value as StatusFilter) : undefined)}
                aria-label={t("connectionsPage.statusAria")}
              >
                {statusCounts.map((opt) => (
                  <ToggleGroupItem
                    key={opt.id}
                    value={opt.id}
                    className="console-chip connections-chip"
                    disabled={opt.count === 0 && opt.id !== "all"}
                  >
                    <span>{opt.label}</span>
                    <span className="console-chip-count">{compactNumber.format(opt.count)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <ToggleGroup
                type="single"
                value={categoryFilter === "all" || moreSelected ? "" : categoryFilter}
                onValueChange={(value) => {
                  if (!value) {
                    setCategoryFilter("all");
                    return;
                  }
                  setCategoryFilter(value as CategoryFilter);
                  setMoreOpen(false);
                }}
                aria-label={t("connectionsPage.categoryAria")}
                className="connections-chip-group"
              >
                {primaryCategoryIds.map((id) => {
                  const count = categoryCounts.get(id) ?? 0;
                  return (
                    <ToggleGroupItem
                      key={id}
                      value={id}
                      className="console-chip connections-chip"
                      disabled={count === 0}
                    >
                      <span>{t(categoryLabelKey(id))}</span>
                      <span className="console-chip-count">{compactNumber.format(count)}</span>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>

              <div className="connections-menu-anchor" ref={moreMenuRef}>
                <button
                  type="button"
                  className={moreSelected ? "console-chip connections-chip is-active" : "console-chip connections-chip"}
                  onClick={() => {
                    setMoreOpen((v) => !v);
                    setFilterMenuOpen(false);
                  }}
                  aria-expanded={moreOpen}
                >
                  <span>{moreLabel}</span>
                  {moreSelected ? (
                    <span className="console-chip-count">
                      {compactNumber.format(categoryCounts.get(categoryFilter) ?? 0)}
                    </span>
                  ) : null}
                </button>
                {moreOpen ? (
                  <div className="connections-menu" role="menu">
                    <div className="connections-menu-label">{t("connectionsPage.moreCategories")}</div>
                    {moreCategoryIds.map((id) => {
                      const count = categoryCounts.get(id) ?? 0;
                      const active = categoryFilter === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="menuitem"
                          className={active ? "connections-menu-item is-active" : "connections-menu-item"}
                          disabled={count === 0}
                          onClick={() => {
                            setCategoryFilter(id);
                            setMoreOpen(false);
                          }}
                        >
                          <span>{t(categoryLabelKey(id))}</span>
                          <span className="connections-menu-count">{compactNumber.format(count)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {filtersActive ? (
                <button type="button" className="connections-reset" onClick={resetFilters}>
                  <X size={13} />
                  {t("connectionsPage.reset")}
                </button>
              ) : null}
            </div>

            <div className="connections-result-meta" aria-live="polite">
              {t("connectionsPage.showing", { shown: shownCount, total: totalCount })}
            </div>
          </div>
        </div>
      </div>

      <div className="connections-scroll-body">
        {visible.length === 0 ? (
          <div className="console-card connections-list-card">
            <div className="console-empty">
              <div>
                <p style={{ margin: 0 }}>{t("connectionsPage.empty")}</p>
                {filtersActive ? (
                  <Button variant="outline" size="sm" type="button" onClick={resetFilters} style={{ marginTop: 12 }}>
                    {t("connectionsPage.resetFilters")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="console-card connections-list-card" data-connections-list>
            {rendered.map((provider) => (
              <AppConnectionRow
                key={provider.service}
                provider={provider}
                status={statusByService.get(provider.service) ?? resolveProviderConnectionStatus(provider, [], [])}
              />
            ))}
            {hasMore ? (
              <div ref={loadMoreRef} className="connections-load-more">
                <Button variant="outline" size="sm" type="button" onClick={loadMore}>
                  {t("connectionsPage.showMore")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
        <ConnectionTeamGrantsCard services={props.data.connections.map((c) => c.service)} />
      </div>
    </section>
  );
}

function AppConnectionRow(props: { provider: ProviderDefinition; status: ProviderConnectionStatus }): ReactNode {
  const t = useTranslate();
  const to = `/providers/${encodeURIComponent(props.provider.service)}`;
  const locallyAvailable = isProviderLocallyAvailable(props.provider);
  const { status } = props;

  let actionLabel = t("connectionsPage.actionConnect");
  let badge: { text: string; tone: "ok" | "warn" | "muted" } | null = null;

  if (!locallyAvailable) {
    actionLabel = t("connectionsPage.actionDetails");
    badge = { text: t("connectionsPage.badgeRuntimeUnavailable"), tone: "muted" };
  } else if (status.noSetupRequired) {
    actionLabel = t("connectionsPage.actionOpen");
    badge = { text: t("connectionsPage.badgeReady"), tone: "ok" };
  } else if (status.connected) {
    actionLabel = t("connectionsPage.actionManage");
    badge = { text: t("connectionsPage.badgeConfigured"), tone: "ok" };
  } else if (status.oauthClientRequired) {
    actionLabel = t("connectionsPage.actionConfigure");
    badge = { text: t("connectionsPage.badgeNeedsAttention"), tone: "warn" };
  }

  const categoryLabel = primaryCategoryLabel(props.provider, t);

  const actionsTo = `/actions?service=${encodeURIComponent(props.provider.service)}`;

  return (
    <div className="console-row" style={rowStyle}>
      <Link to={to} className="console-row-main">
        <ProviderIcon provider={props.provider} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="console-row-title">{props.provider.displayName || props.provider.service}</span>
            {badge ? (
              <span
                className="team-pill"
                style={
                  badge.tone === "ok"
                    ? {
                        background: "color-mix(in oklab, var(--success, #10b981) 16%, transparent)",
                        color: "var(--success, #047857)",
                      }
                    : badge.tone === "warn"
                      ? {
                          background: "color-mix(in oklab, #f97316 14%, transparent)",
                          color: "#c2410c",
                        }
                      : undefined
                }
              >
                {badge.text}
              </span>
            ) : null}
            {categoryLabel ? <span className="console-row-meta">{categoryLabel}</span> : null}
          </div>
          <div className="console-row-meta">{props.provider.service}</div>
        </div>
      </Link>
      <div className="console-row-actions">
        <Link
          to={actionsTo}
          className="console-row-action console-row-action-secondary"
          title={t("connectionsPage.viewActionsTitle")}
        >
          {t("connectionsPage.actions")}
        </Link>
        <Link to={to} className="console-row-action">
          {actionLabel}
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function matchStatus(status: ProviderConnectionStatus | undefined, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (!status) return false;
  if (filter === "configured") return status.connected;
  if (filter === "needs_attention") return status.oauthClientRequired || (!status.connected && !status.noSetupRequired);
  if (filter === "ready") return status.noSetupRequired;
  return true;
}

/** Docs chip: catalog often tags Drive/Docs as Productivity — map by service id. */
const DOCUMENT_SERVICE_IDS = new Set([
  "googledocs",
  "googledrive",
  "googleslides",
  "googleforms",
  "notion",
  "dropbox",
  "confluence",
  "one_drive",
  "tencent_docs",
  "googlephotos",
  "aliyun_oss",
]);

function matchCategory(provider: ProviderDefinition, filter: CategoryFilter): boolean {
  if (filter === "all") return true;
  const cats = provider.categories.map((c) => c.toLowerCase());
  const service = provider.service.toLowerCase();
  if (filter === "AI") return cats.some((c) => c === "ai" || c.includes("ai"));
  if (filter === "Productivity") return cats.some((c) => c === "productivity" || c.includes("productiv"));
  if (filter === "Documents") {
    if (DOCUMENT_SERVICE_IDS.has(service)) return true;
    return cats.some(
      (c) =>
        c.includes("document") ||
        c.includes("docs") ||
        c === "books" ||
        c === "reference" ||
        c.includes("note") ||
        (c.includes("storage") && !c.includes("data")),
    );
  }
  if (filter === "Developer Tools") {
    return cats.some((c) => c.includes("developer") || c.includes("infrastructure"));
  }
  if (filter === "Marketing") return cats.some((c) => c.includes("marketing") || c.includes("social"));
  if (filter === "Communication") return cats.some((c) => c.includes("communication"));
  if (filter === "DataStorage") {
    return cats.some((c) => c === "data" || c.includes("storage") || c.includes("finance"));
  }
  if (filter === "Other") {
    return !allCategoryIds.some((id) => id !== "Other" && matchCategory(provider, id));
  }
  return true;
}

function primaryCategoryLabel(
  provider: ProviderDefinition,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | undefined {
  for (const id of allCategoryIds) {
    if (id !== "Other" && matchCategory(provider, id)) return t(categoryLabelKey(id));
  }
  return t("connectionsPage.categoryOther");
}

function useProgressiveLimit(total: number, resetKey: string): { hasMore: boolean; limit: number; loadMore(): void } {
  const [limit, setLimit] = useState(pageSize);

  useEffect(() => {
    setLimit(pageSize);
  }, [resetKey]);

  useEffect(() => {
    if (limit > total) setLimit(Math.max(pageSize, total));
  }, [limit, total]);

  const loadMore = useCallback(() => {
    setLimit((c) => Math.min(c + pageSize, total));
  }, [total]);

  return { hasMore: limit < total, limit: Math.min(limit, total), loadMore };
}

function useIntersectionLoader(enabled: boolean, onLoad: () => void): (node: HTMLDivElement | null) => void {
  const onLoadRef = useRef(onLoad);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  const setNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!enabled || !node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadRef.current();
      },
      { rootMargin: "480px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return setNode;
}

function ConnectionTeamGrantsCard(props: { services: string[] }): ReactNode {
  const unique = [...new Set(props.services.filter(Boolean))];
  const [service, setService] = useState(unique[0] ?? "");
  const [teamIds, setTeamIds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!service && unique[0]) setService(unique[0]);
  }, [service, unique]);

  async function save(): Promise<void> {
    setError(null);
    setMessage(null);
    try {
      const ids = teamIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await apiPut(
        "/api/company/connections/team-grants",
        { service, connectionName: "default", teamIds: ids },
        memberAuthHeaders(),
      );
      setMessage(ids.length ? "Team grants saved" : "Team grants cleared (all teams)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function load(): Promise<void> {
    try {
      const res = await apiGet<{ items: Array<{ service: string; connectionName: string; teamIds: string[] }> }>(
        "/api/company/connections/team-grants",
        memberAuthHeaders(),
      );
      const row = res.items.find((i) => i.service === service && i.connectionName === "default");
      setTeamIds((row?.teamIds ?? []).join(", "));
    } catch {
      /* optional */
    }
  }

  useEffect(() => {
    if (service) void load();
  }, [service]);

  if (unique.length === 0) return null;

  return (
    <section className="console-card connection-grants-card" data-testid="connection-team-grants">
      <h2 className="console-card-title">Connection team grants</h2>
      <p className="console-card-subtitle">Empty list = all teams. A grant list requires X-Team-Id.</p>
      {error ? <p className="page-toast">{error}</p> : null}
      {message ? <p className="page-toast">{message}</p> : null}
      <div className="org-config-form-grid">
        <select value={service} onChange={(e) => setService(e.target.value)} data-testid="grant-service">
          {unique.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          value={teamIds}
          onChange={(e) => setTeamIds(e.target.value)}
          placeholder="team ids, comma separated"
          data-testid="grant-team-ids"
        />
        <Button size="sm" type="button" onClick={() => void save()}>
          Save grants
        </Button>
      </div>
    </section>
  );
}
