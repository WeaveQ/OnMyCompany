import type { AppData, ProviderConnectionStatus, ProviderDefinition } from "./model";
import type { CSSProperties, ReactNode } from "react";

import { ArrowUpDown, ChevronRight, ListFilter, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  filterProviders,
  resolveProviderConnectionStatus,
  sortProviders,
} from "./model";
import { isProviderLocallyAvailable } from "./providers-page";
import { ProviderIcon } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ConnectionsPageProps {
  data: AppData;
  onRefresh(): void;
}

/** Status chips aligned with product reference: 全部 / 已配置 / 需要处理 / 可直接使用 */
type StatusFilter = "all" | "configured" | "needs_attention" | "ready";

/**
 * Primary + overflow category chips (reference: AI / 效率 / 文档 / 开发者 / 更多).
 * Values match catalog `provider.categories` English tags.
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

/** Exported for structural tests (status chip labels). */
export const CONNECTION_STATUS_LABELS = ["全部", "已配置", "需要处理", "可直接使用"] as const;

const statusOptions: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "configured", label: "已配置" },
  { id: "needs_attention", label: "需要处理" },
  { id: "ready", label: "可直接使用" },
];

/** Visible primary chips (office-focused order). */
const primaryCategoryOptions: Array<{ id: CategoryFilter; label: string }> = [
  { id: "AI", label: "AI" },
  { id: "Productivity", label: "效率" },
  { id: "Communication", label: "沟通" },
  { id: "Documents", label: "文档" },
  { id: "Developer Tools", label: "开发者" },
];

/** Under「更多」dropdown. */
const moreCategoryOptions: Array<{ id: CategoryFilter; label: string }> = [
  { id: "Marketing", label: "营销" },
  { id: "DataStorage", label: "数据与存储" },
  { id: "Other", label: "其他" },
];

const allCategoryOptions = [...primaryCategoryOptions, ...moreCategoryOptions];

const compactNumber = Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const rowStyle = {
  contentVisibility: "auto",
  containIntrinsicSize: "56px",
} satisfies CSSProperties;

/**
 * 团队的应用连接 — catalog of gateway apps with status + category distinction
 * (product reference: 全部/已配置/需要处理/可直接使用 + AI/效率/…).
 */
type SortMode = "recommended" | "name";

export function ConnectionsPage(props: ConnectionsPageProps): ReactNode {
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

  const visible = useMemo(
    () => byStatus.filter((p) => matchCategory(p, categoryFilter)),
    [byStatus, categoryFilter],
  );

  const statusCounts = useMemo(
    () =>
      statusOptions.map((opt) => ({
        ...opt,
        count:
          opt.id === "all"
            ? searched.length
            : searched.filter((p) => matchStatus(statusByService.get(p.service), opt.id)).length,
      })),
    [searched, statusByService],
  );

  const categoryCounts = useMemo(() => {
    const base = byStatus;
    const counts = new Map<CategoryFilter, number>();
    for (const opt of allCategoryOptions) {
      counts.set(opt.id, base.filter((p) => matchCategory(p, opt.id)).length);
    }
    return counts;
  }, [byStatus]);

  const resetKey = `${query}|${statusFilter}|${categoryFilter}|${sortMode}`;
  const {
    hasMore,
    limit,
    loadMore,
  } = useProgressiveLimit(visible.length, resetKey);
  const loadMoreRef = useIntersectionLoader(hasMore, loadMore);
  const rendered = visible.slice(0, limit);

  const filtersActive =
    query.trim().length > 0 || statusFilter !== "all" || categoryFilter !== "all";

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setMoreOpen(false);
    setFilterMenuOpen(false);
  }

  const moreSelected = moreCategoryOptions.some((o) => o.id === categoryFilter);
  const moreLabel = moreSelected
    ? moreCategoryOptions.find((o) => o.id === categoryFilter)?.label ?? "更多"
    : "更多";
  const totalCount = searched.length;
  const shownCount = visible.length;

  return (
    <section className="connections-browser page-stack" data-connections-root>
      <header className="page-hero">
        <h1 className="page-hero-title">应用连接</h1>
        <p className="page-hero-lead">
          配置公司对外 SaaS 账号（GitHub、飞书等）。密钥只存服务端；Agent 通过 MCP /v1 调用。
        </p>
      </header>
      <div className="connections-chrome">
        <div className="connections-toolbar">
          <h2 className="connections-title">服务商列表</h2>
          <div className="connections-toolbar-actions">
            <label className="connections-search">
              <Search className="connections-search-icon" size={15} aria-hidden />
              <Input
                className="connections-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索服务商"
                aria-label="搜索服务商"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="connections-tool-btn"
              onClick={() => setSortMode((mode) => (mode === "recommended" ? "name" : "recommended"))}
              aria-label={sortMode === "recommended" ? "当前：推荐排序，点击按名称" : "当前：名称排序，点击推荐排序"}
              title={sortMode === "recommended" ? "推荐排序" : "按名称"}
            >
              <ArrowUpDown size={14} />
              <span className="connections-tool-label">{sortMode === "recommended" ? "推荐排序" : "按名称"}</span>
            </Button>
            <div className="connections-menu-anchor align-end" ref={filterMenuRef}>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="connections-tool-btn"
                aria-expanded={filterMenuOpen}
                title="更多筛选"
                onClick={() => {
                  setFilterMenuOpen((v) => !v);
                  setMoreOpen(false);
                }}
              >
                <ListFilter size={14} />
                <span className="connections-tool-label">更多筛选</span>
              </Button>
              {filterMenuOpen ? (
                <div className="connections-menu" role="menu">
                  <div className="connections-menu-label">筛选与工具</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="connections-menu-item"
                    onClick={() => {
                      resetFilters();
                      setFilterMenuOpen(false);
                    }}
                  >
                    重置全部筛选
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
                    刷新数据
                  </button>
                  <div className="connections-menu-divider" />
                  <Link
                    to="/providers"
                    role="menuitem"
                    className="connections-menu-item"
                    onClick={() => setFilterMenuOpen(false)}
                  >
                    提供商目录（高级）
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
              aria-label="连接状态"
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
              aria-label="应用分类"
              className="connections-chip-group"
            >
              {primaryCategoryOptions.map((opt) => {
                const count = categoryCounts.get(opt.id) ?? 0;
                return (
                  <ToggleGroupItem
                    key={opt.id}
                    value={opt.id}
                    className="console-chip connections-chip"
                    disabled={count === 0}
                  >
                    <span>{opt.label}</span>
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
                  <div className="connections-menu-label">更多分类</div>
                  {moreCategoryOptions.map((opt) => {
                    const count = categoryCounts.get(opt.id) ?? 0;
                    const active = categoryFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        className={active ? "connections-menu-item is-active" : "connections-menu-item"}
                        disabled={count === 0}
                        onClick={() => {
                          setCategoryFilter(opt.id);
                          setMoreOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
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
                重置
              </button>
            ) : null}
          </div>

          <div className="connections-result-meta" aria-live="polite">
            显示 {shownCount}/{totalCount}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="console-card connections-list-card">
          <div className="console-empty">
            <div>
              <p style={{ margin: 0 }}>没有匹配的应用连接</p>
              {filtersActive ? (
                <Button variant="outline" size="sm" type="button" onClick={resetFilters} style={{ marginTop: 12 }}>
                  重置筛选
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
              status={
                statusByService.get(provider.service) ??
                resolveProviderConnectionStatus(provider, [], [])
              }
            />
          ))}
          {hasMore ? (
            <div ref={loadMoreRef} className="connections-load-more">
              <Button variant="outline" size="sm" type="button" onClick={loadMore}>
                显示更多
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AppConnectionRow(props: {
  provider: ProviderDefinition;
  status: ProviderConnectionStatus;
}): ReactNode {
  const to = `/providers/${encodeURIComponent(props.provider.service)}`;
  const locallyAvailable = isProviderLocallyAvailable(props.provider);
  const { status } = props;

  let actionLabel = "连接";
  let badge: { text: string; tone: "ok" | "warn" | "muted" } | null = null;

  if (!locallyAvailable) {
    actionLabel = "详情";
    badge = { text: "运行时不可用", tone: "muted" };
  } else if (status.noSetupRequired) {
    actionLabel = "打开";
    badge = { text: "可直接使用", tone: "ok" };
  } else if (status.connected) {
    actionLabel = "管理";
    badge = { text: "已配置", tone: "ok" };
  } else if (status.oauthClientRequired) {
    actionLabel = "配置";
    badge = { text: "需要处理", tone: "warn" };
  }

  const categoryLabel = primaryCategoryLabel(props.provider);

  const actionsTo = `/actions?service=${encodeURIComponent(props.provider.service)}`;

  return (
    <div className="console-row" style={rowStyle}>
      <Link to={to} className="console-row-main">
        <ProviderIcon provider={props.provider} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="console-row-title">
              {props.provider.displayName || props.provider.service}
            </span>
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
        <Link to={actionsTo} className="console-row-action console-row-action-secondary" title="查看该应用的操作并试跑">
          操作
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
    // Not in any primary/more bucket above
    return !allCategoryOptions.some((opt) => opt.id !== "Other" && matchCategory(provider, opt.id));
  }
  return true;
}

function primaryCategoryLabel(provider: ProviderDefinition): string | undefined {
  for (const opt of allCategoryOptions) {
    if (opt.id !== "Other" && matchCategory(provider, opt.id)) return opt.label;
  }
  return "其他";
}

function useProgressiveLimit(
  total: number,
  resetKey: string,
): { hasMore: boolean; limit: number; loadMore(): void } {
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
