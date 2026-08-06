import { describe, expect, it } from "vitest";
import type { RunLog } from "../../server/storage/runtime-store.ts";
import { filterRunsForUsage, summarizeUsage } from "./export.ts";

function run(partial: Partial<RunLog> & Pick<RunLog, "id" | "startedAt" | "ok">): RunLog {
  return {
    service: "github",
    actionId: "github.x",
    caller: "http",
    completedAt: partial.startedAt,
    durationMs: 10,
    ...partial,
  };
}

describe("usage summary filters", () => {
  const runs: RunLog[] = [
    run({ id: "1", startedAt: "2026-07-01T12:00:00.000Z", ok: true, memberId: "a", service: "github" }),
    run({
      id: "2",
      startedAt: "2026-08-01T12:00:00.000Z",
      ok: false,
      memberId: "b",
      service: "slack",
      fallback: true,
    }),
    run({ id: "3", startedAt: "2026-08-02T12:00:00.000Z", ok: true, memberId: "a", service: "github" }),
  ];

  it("filters by date range and member", () => {
    const filtered = filterRunsForUsage(runs, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      memberId: "a",
    });
    expect(filtered.map((r) => r.id)).toEqual(["3"]);
  });

  it("counts fallback and byDay", () => {
    const summary = summarizeUsage(runs, { appliedLimit: 100 });
    expect(summary.totalRuns).toBe(3);
    expect(summary.fallbackRuns).toBe(1);
    expect(summary.activeServices).toBe(2);
    expect(summary.byDay.length).toBeGreaterThanOrEqual(2);
  });
});
