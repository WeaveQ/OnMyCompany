import type { RunLog } from "../../server/storage/runtime-store.ts";

export function runsToJsonl(runs: RunLog[]): string {
  return runs.map((run) => JSON.stringify(serializeRun(run))).join("\n") + (runs.length ? "\n" : "");
}

export function runsToCsv(runs: RunLog[]): string {
  const headers = [
    "id",
    "service",
    "actionId",
    "caller",
    "startedAt",
    "completedAt",
    "durationMs",
    "ok",
    "memberId",
    "runtimeTokenId",
    "connectionName",
    "attempt",
    "fallback",
    "errorCode",
    "errorMessage",
  ];
  const lines = [headers.join(",")];
  for (const run of runs) {
    const row = serializeRun(run);
    lines.push(
      headers
        .map((h) => csvCell(row[h as keyof typeof row]))
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function serializeRun(run: RunLog) {
  return {
    id: run.id,
    service: run.service,
    actionId: run.actionId,
    caller: run.caller,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    ok: run.ok,
    memberId: run.memberId ?? "",
    runtimeTokenId: run.runtimeTokenId ?? "",
    connectionName: run.connectionName ?? "",
    attempt: run.attempt ?? "",
    fallback: run.fallback === true ? "true" : run.fallback === false ? "false" : "",
    errorCode: run.errorCode ?? "",
    errorMessage: run.errorMessage ?? "",
  };
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface UsageSummary {
  totalRuns: number;
  okRuns: number;
  failedRuns: number;
  fallbackRuns: number;
  activeMembers: number;
  activeServices: number;
  byMember: Array<{ memberId: string; count: number }>;
  byService: Array<{ service: string; count: number }>;
  byAction: Array<{ actionId: string; count: number }>;
  /** Daily buckets for simple trend charts (UTC date). */
  byDay: Array<{ date: string; total: number; ok: number; failed: number }>;
  range: { from?: string; to?: string; appliedLimit: number; scanned: number };
}

export interface UsageFilter {
  from?: string;
  to?: string;
  memberId?: string;
  teamId?: string;
  service?: string;
  appliedLimit?: number;
}

export function filterRunsForUsage(runs: RunLog[], filter: UsageFilter = {}): RunLog[] {
  const fromMs = filter.from ? Date.parse(filter.from) : Number.NaN;
  const toMs = filter.to ? Date.parse(filter.to) : Number.NaN;
  return runs.filter((run) => {
    const t = Date.parse(run.startedAt);
    if (Number.isFinite(fromMs) && t < fromMs) return false;
    if (Number.isFinite(toMs) && t > toMs) return false;
    if (filter.memberId && (run.memberId || "unknown") !== filter.memberId) return false;
    if (filter.teamId && run.teamId !== filter.teamId) return false;
    if (filter.service && run.service !== filter.service) return false;
    return true;
  });
}

export function summarizeUsage(runs: RunLog[], filter: UsageFilter = {}): UsageSummary {
  const filtered = filterRunsForUsage(runs, filter);
  const byMember = new Map<string, number>();
  const byService = new Map<string, number>();
  const byAction = new Map<string, number>();
  const byDay = new Map<string, { total: number; ok: number; failed: number }>();
  let okRuns = 0;
  let failedRuns = 0;
  let fallbackRuns = 0;
  for (const run of filtered) {
    if (run.ok) okRuns += 1;
    else failedRuns += 1;
    if (run.fallback) fallbackRuns += 1;
    const mid = run.memberId || "unknown";
    byMember.set(mid, (byMember.get(mid) ?? 0) + 1);
    byService.set(run.service, (byService.get(run.service) ?? 0) + 1);
    byAction.set(run.actionId, (byAction.get(run.actionId) ?? 0) + 1);
    const day = run.startedAt.slice(0, 10);
    const bucket = byDay.get(day) ?? { total: 0, ok: 0, failed: 0 };
    bucket.total += 1;
    if (run.ok) bucket.ok += 1;
    else bucket.failed += 1;
    byDay.set(day, bucket);
  }
  const sortCount = <T extends string>(map: Map<T, number>, key: T extends string ? string : never) =>
    [...map.entries()]
      .map(([k, count]) => ({ [key]: k, count }) as Record<string, string | number>)
      .sort((a, b) => Number(b.count) - Number(a.count));

  return {
    totalRuns: filtered.length,
    okRuns,
    failedRuns,
    fallbackRuns,
    activeMembers: byMember.size,
    activeServices: byService.size,
    byMember: sortCount(byMember, "memberId") as Array<{ memberId: string; count: number }>,
    byService: sortCount(byService, "service") as Array<{ service: string; count: number }>,
    byAction: sortCount(byAction, "actionId") as Array<{ actionId: string; count: number }>,
    byDay: [...byDay.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    range: {
      from: filter.from,
      to: filter.to,
      appliedLimit: filter.appliedLimit ?? runs.length,
      scanned: runs.length,
    },
  };
}
