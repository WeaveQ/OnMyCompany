import type { RunLog, RunLogPage } from "./model";
import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { apiGet } from "./api";
import { getMemberToken } from "./member-session";
import { compactJson, formatDate, formatDuration } from "./model";
import { Badge, EmptyState, InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RunsPageProps {
  initialRuns: RunLog[];
  nextCursor?: string;
}

interface RunServiceOption {
  service: string;
  count: number;
}

export interface RunFilters {
  service: string | null;
  actionId: string;
  caller: RunLog["caller"] | null;
  ok: boolean | null;
  memberId: string | null;
}

const allServicesFilterValue = "__all_services__";
const allActionsFilterValue = "__all_actions__";
const allCallersFilterValue = "__all_callers__";
const allStatusesFilterValue = "__all_statuses__";
const allMembersFilterValue = "__all_members__";
const runPageLimit = 50;

export function RunsPage(props: RunsPageProps): ReactNode {
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = runFiltersFromSearchParams(searchParams);
  const [runs, setRuns] = useState(props.initialRuns);
  const [nextCursor, setNextCursor] = useState(props.nextCursor);
  const [loading, setLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(() => new Set());
  const requestGeneration = useRef(0);
  const allRuns = useMemo(() => [...props.initialRuns, ...runs], [props.initialRuns, runs]);
  const serviceOptions = useMemo(() => runServiceOptions(allRuns), [allRuns]);
  const actionOptions = useMemo(() => runActionOptions(allRuns), [allRuns]);
  const callerOptions = useMemo(
    () => [...new Set(allRuns.map((run) => run.caller))],
    [allRuns],
  );
  const memberOptions = useMemo(() => runMemberOptions(allRuns), [allRuns]);
  const hasFilters = Boolean(
    filters.service || filters.actionId || filters.caller || filters.ok !== null || filters.memberId,
  );

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setRunsError(null);
    if (!hasFilters) {
      setRuns(props.initialRuns);
      setNextCursor(props.nextCursor);
      setLoading(false);
      return;
    }
    void loadFilteredRuns(filters, generation);
  }, [props.initialRuns, props.nextCursor, searchParams]);

  async function loadFilteredRuns(nextFilters: RunFilters, generation: number): Promise<void> {
    setLoading(true);
    setRuns([]);
    setNextCursor(undefined);
    try {
      const page = await apiGet<RunLogPage>(runListPath({ filters: nextFilters }));
      if (generation !== requestGeneration.current) return;
      setRuns(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setRunsError(caught instanceof Error ? caught.message : t("runs.loadMoreFailed"));
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  async function loadMoreRuns(): Promise<void> {
    if (!nextCursor || loading) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setRunsError(null);
    try {
      const page = await apiGet<RunLogPage>(runListPath({ cursor: nextCursor, filters }));
      if (generation !== requestGeneration.current) return;
      setRuns((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setRunsError(caught instanceof Error ? caught.message : t("runs.loadMoreFailed"));
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  function updateFilter(name: keyof RunFilters, value: string | null): void {
    requestGeneration.current += 1;
    setLoading(false);
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
    setSearchParams(next);
  }

  function toggleResult(id: string): void {
    setExpandedResults((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportAudit(format: "jsonl" | "csv"): Promise<void> {
    const token = getMemberToken();
    if (!token) {
      setRunsError("Login as org member (admin/auditor) to export audit");
      return;
    }
    try {
      const res = await fetch(`/api/company/audit/export?format=${format}&limit=5000`, {
        headers: { authorization: `Bearer ${token}` },
        credentials: "same-origin",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `export ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "csv" ? "audit-runs.csv" : "audit-runs.jsonl";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <TooltipProvider>
      <div className="page-stack runs-page">
        <header className="page-hero page-hero-row">
          <div>
            <h1 className="page-hero-title">运行记录</h1>
            <p className="page-hero-lead">网关 Action 执行历史（可按服务/状态筛选；支持导出审计）。</p>
          </div>
          <div className="page-hero-actions">
            <Button type="button" variant="outline" size="sm" onClick={() => void exportAudit("jsonl")}>
              导出 JSONL
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportAudit("csv")}>
              导出 CSV
            </Button>
          </div>
        </header>
        <section className="page-toolbar runs-toolbar" aria-label="筛选运行记录">
          <RunSelect
            label={t("runs.action")}
            value={filters.actionId || allActionsFilterValue}
            onChange={(value) => updateFilter("actionId", value === allActionsFilterValue ? null : value)}
          >
            <SelectItem value={allActionsFilterValue}>{t("runs.allActions")}</SelectItem>
            {actionOptions.map((option) => (
              <SelectItem key={option.actionId} value={option.actionId}>
                {option.actionId} ({option.count})
              </SelectItem>
            ))}
          </RunSelect>
          <RunSelect
            label={t("runs.service")}
            value={filters.service ?? allServicesFilterValue}
            onChange={(value) => updateFilter("service", value === allServicesFilterValue ? null : value)}
          >
            <SelectItem value={allServicesFilterValue}>{t("runs.allServices")}</SelectItem>
            {serviceOptions.map((option) => (
              <SelectItem key={option.service} value={option.service}>
                {option.service} ({option.count})
              </SelectItem>
            ))}
          </RunSelect>
          <RunSelect
            label={t("runs.member")}
            value={filters.memberId ?? allMembersFilterValue}
            onChange={(value) => updateFilter("memberId", value === allMembersFilterValue ? null : value)}
          >
            <SelectItem value={allMembersFilterValue}>{t("runs.allMembers")}</SelectItem>
            {memberOptions.map((option) => (
              <SelectItem key={option.memberId} value={option.memberId}>
                {formatMemberOptionLabel(option)}
              </SelectItem>
            ))}
          </RunSelect>
          <RunSelect
            label={t("runs.caller")}
            value={filters.caller ?? allCallersFilterValue}
            onChange={(value) => updateFilter("caller", value === allCallersFilterValue ? null : value)}
          >
            <SelectItem value={allCallersFilterValue}>{t("runs.allCallers")}</SelectItem>
            {callerOptions.map((caller) => (
              <SelectItem key={caller} value={caller}>
                {caller}
              </SelectItem>
            ))}
          </RunSelect>
          <RunSelect
            label={t("runs.status")}
            value={filters.ok === null ? allStatusesFilterValue : String(filters.ok)}
            onChange={(value) => updateFilter("ok", value === allStatusesFilterValue ? null : value)}
          >
            <SelectItem value={allStatusesFilterValue}>{t("runs.allStatuses")}</SelectItem>
            <SelectItem value="true">{t("common.success")}</SelectItem>
            <SelectItem value="false">{t("common.failed")}</SelectItem>
          </RunSelect>
        </section>

        <section className="table-panel">
          {runs.length === 0 ? (
            <EmptyState title={t("runs.noRunsTitle")} description={t("runs.noRunsDescription")} icon={null} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="run-col-timing">{t("runs.table.timing")}</TableHead>
                  <TableHead className="run-col-status">{t("runs.table.status")}</TableHead>
                  <TableHead className="run-col-action">{t("runs.table.action")}</TableHead>
                  <TableHead className="run-col-context">{t("runs.table.context")}</TableHead>
                  <TableHead className="run-col-summary">{t("runs.table.input")}</TableHead>
                  <TableHead className="run-col-summary">{t("runs.table.result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const expanded = expandedResults.has(run.id);
                  const output = run.outputSummary == null ? "" : JSON.stringify(run.outputSummary);
                  const expandable = output.length > 120;
                  const policyCheck = run.policy?.checks.at(-1);
                  return (
                    <Fragment key={run.id}>
                      <TableRow>
                        <TableCell className="run-col-timing">
                          <div className="run-primary">{formatDate(run.startedAt)}</div>
                          <div className="run-secondary">{formatDuration(run)}</div>
                        </TableCell>
                        <TableCell className="run-col-status">
                          {run.ok ? (
                            <Badge tone="success">{t("common.success")}</Badge>
                          ) : (
                            <Badge tone="error">{t("common.failed")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="run-col-action">
                          <div className="run-primary mono">{run.actionId}</div>
                          <div className="run-secondary mono">
                            <span>{run.id}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("runs.copyExecutionId")}
                                  onClick={() => void navigator.clipboard.writeText(run.id)}
                                >
                                  <Copy size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("runs.copyExecutionId")}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell className="run-col-context">
                          <div className="run-primary mono">{run.caller}</div>
                          <div className="run-secondary">
                            {run.connectionProfile?.displayName ?? run.connectionId ?? "-"}
                          </div>
                          {run.policy ? (
                            <div className="run-secondary mono">
                              {t(run.policy.allowed ? "runs.policyAllowed" : "runs.policyBlocked")}
                              {policyCheck
                                ? ` · ${t(`access.policy.sources.${policyCheck.source}`)}${policyCheck.rule ? `: ${policyCheck.rule}` : ""}`
                                : ""}
                            </div>
                          ) : null}
                          {run.runtimeTokenId ? (
                            <div className="run-secondary mono">
                              {t("runs.runtimeToken")}: {run.runtimeTokenId}
                            </div>
                          ) : null}
                          {run.memberId ? (
                            <div className="run-secondary mono">member: {run.memberId}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="mono run-summary run-col-summary">
                          {compactJson(run.inputSummary)}
                        </TableCell>
                        <TableCell className="mono run-summary run-col-summary">
                          {run.ok ? (
                            <div className="run-result">
                              <pre>{output}</pre>
                              {expandable ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={t(expanded ? "runs.collapseResult" : "runs.expandResult")}
                                      aria-expanded={expanded}
                                      onClick={() => toggleResult(run.id)}
                                    >
                                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t(expanded ? "runs.collapseResult" : "runs.expandResult")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              <div className="run-primary">{run.errorCode ?? "-"}</div>
                              {run.errorMessage ? <div className="run-secondary">{run.errorMessage}</div> : null}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className="run-result-detail-row">
                          <TableCell colSpan={6}>
                            <pre className="run-result-detail">{JSON.stringify(run.outputSummary, null, 2)}</pre>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
        <div className="list-page-footer runs-page-footer" data-testid="runs-page-footer">
          <span className="console-row-meta tabular-nums">
            已显示 {runs.length} 条
            {nextCursor ? " · 还有更多" : runs.length > 0 ? " · 已到末尾" : ""}
          </span>
          {runsError ? <InlineError message={runsError} /> : null}
          {nextCursor ? (
            <Button variant="outline" size="sm" onClick={() => void loadMoreRuns()} disabled={loading}>
              {loading ? <Loader2 size={14} className="spin" /> : null}
              {t("runs.loadMore")}
            </Button>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function RunSelect(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
}): ReactNode {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="select-filter run-select-filter" aria-label={props.label}>
        <span className="select-filter-label">{props.label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="select-filter-content" position="popper" align="start">
        {props.children}
      </SelectContent>
    </Select>
  );
}

export function runServiceOptions(runs: RunLog[]): RunServiceOption[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    counts.set(run.service, (counts.get(run.service) ?? 0) + 1);
  }
  return [...counts.entries()].map(([service, count]) => ({ service, count }));
}

export interface RunActionOption {
  actionId: string;
  count: number;
}

/** Distinct action ids from run history (most frequent first). */
export function runActionOptions(runs: RunLog[]): RunActionOption[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const run of runs) {
    if (!run.actionId || seen.has(run.id)) continue;
    seen.add(run.id);
    counts.set(run.actionId, (counts.get(run.actionId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([actionId, count]) => ({ actionId, count }))
    .sort((a, b) => b.count - a.count || a.actionId.localeCompare(b.actionId));
}

export interface RunMemberOption {
  memberId: string;
  count: number;
}

/** Distinct memberIds from run history (most frequent first). */
export function runMemberOptions(runs: RunLog[]): RunMemberOption[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const run of runs) {
    if (!run.memberId || seen.has(run.id)) continue;
    seen.add(run.id);
    counts.set(run.memberId, (counts.get(run.memberId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([memberId, count]) => ({ memberId, count }))
    .sort((a, b) => b.count - a.count || a.memberId.localeCompare(b.memberId));
}

export function formatMemberOptionLabel(option: RunMemberOption): string {
  const short =
    option.memberId.length > 12
      ? `${option.memberId.slice(0, 8)}…${option.memberId.slice(-4)}`
      : option.memberId;
  return `${short} (${option.count})`;
}

export function runListPath(input: { cursor?: string; filters: RunFilters }): string {
  const query = new URLSearchParams({ limit: String(runPageLimit) });
  if (input.cursor) query.set("cursor", input.cursor);
  if (input.filters.service) query.set("service", input.filters.service);
  if (input.filters.actionId) query.set("actionId", input.filters.actionId);
  if (input.filters.caller) query.set("caller", input.filters.caller);
  if (input.filters.ok !== null) query.set("ok", String(input.filters.ok));
  if (input.filters.memberId) query.set("memberId", input.filters.memberId);
  return `/api/runs?${query}`;
}

export function runFiltersFromSearchParams(searchParams: URLSearchParams): RunFilters {
  const caller = searchParams.get("caller")?.trim();
  const ok = searchParams.get("ok")?.trim();
  const memberId = searchParams.get("memberId")?.trim() || null;
  return {
    service: searchParams.get("service")?.trim() || null,
    actionId: searchParams.get("actionId")?.trim() || "",
    caller: caller === "http" || caller === "mcp" || caller === "web" ? caller : null,
    ok: ok === "true" ? true : ok === "false" ? false : null,
    memberId: memberId && memberId.length <= 128 ? memberId : null,
  };
}
