import type { RunLog } from "../../server/storage/runtime-store.ts";

export interface ToolRunQuotaLimits {
  memberDailyRuns?: number;
  memberMonthlyRuns?: number;
  teamDailyRuns?: number;
  teamMonthlyRuns?: number;
}

export type ToolRunQuotaDecision =
  | { ok: true }
  | { ok: false; code: "quota_exceeded"; message: string; dimension: string; limit: number; used: number };

const quotaKeys = ["memberDailyRuns", "memberMonthlyRuns", "teamDailyRuns", "teamMonthlyRuns"] as const;

/**
 * Soft tool-run quota (G3). Counts Gateway runs only — not Omni token usage.
 * Missing / non-positive limits are unlimited.
 */
export function parseToolRunQuota(policy: Record<string, unknown> | undefined): ToolRunQuotaLimits {
  const raw =
    policy && typeof policy.quota === "object" && policy.quota !== null
      ? (policy.quota as Record<string, unknown>)
      : {};
  const out: ToolRunQuotaLimits = {};
  for (const key of quotaKeys) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  }
  return out;
}

export function evaluateToolRunQuota(input: {
  limits: ToolRunQuotaLimits;
  runs: readonly RunLog[];
  memberId?: string;
  teamId?: string;
  now?: Date;
}): ToolRunQuotaDecision {
  const now = input.now ?? new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);

  if (input.memberId && input.limits.memberDailyRuns) {
    const used = countRuns(input.runs, { memberId: input.memberId, from: dayStart });
    if (used >= input.limits.memberDailyRuns) {
      return deny("memberDailyRuns", input.limits.memberDailyRuns, used);
    }
  }
  if (input.memberId && input.limits.memberMonthlyRuns) {
    const used = countRuns(input.runs, { memberId: input.memberId, from: monthStart });
    if (used >= input.limits.memberMonthlyRuns) {
      return deny("memberMonthlyRuns", input.limits.memberMonthlyRuns, used);
    }
  }
  if (input.teamId && input.limits.teamDailyRuns) {
    const used = countRuns(input.runs, { teamId: input.teamId, from: dayStart });
    if (used >= input.limits.teamDailyRuns) {
      return deny("teamDailyRuns", input.limits.teamDailyRuns, used);
    }
  }
  if (input.teamId && input.limits.teamMonthlyRuns) {
    const used = countRuns(input.runs, { teamId: input.teamId, from: monthStart });
    if (used >= input.limits.teamMonthlyRuns) {
      return deny("teamMonthlyRuns", input.limits.teamMonthlyRuns, used);
    }
  }
  return { ok: true };
}

function deny(dimension: string, limit: number, used: number): ToolRunQuotaDecision {
  return {
    ok: false,
    code: "quota_exceeded",
    message: `Tool-run quota exceeded (${dimension}: ${used}/${limit}). Model token limits stay in OmniRoute.`,
    dimension,
    limit,
    used,
  };
}

function countRuns(runs: readonly RunLog[], filter: { memberId?: string; teamId?: string; from: Date }): number {
  const fromMs = filter.from.getTime();
  let n = 0;
  for (const run of runs) {
    if (filter.memberId && run.memberId !== filter.memberId) continue;
    if (filter.teamId && run.teamId !== filter.teamId) continue;
    const started = Date.parse(run.startedAt);
    if (!Number.isFinite(started) || started < fromMs) continue;
    n += 1;
  }
  return n;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
