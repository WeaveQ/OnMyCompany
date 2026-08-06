import type { RunLog } from "./model";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  RunsPage,
  formatMemberOptionLabel,
  runFiltersFromSearchParams,
  runListPath,
  runMemberOptions,
  runServiceOptions,
} from "./runs-page";

vi.mock("@embra/i18n/react", () => ({
  useTranslate() {
    return (key: string) => key;
  },
}));

describe("runServiceOptions", () => {
  it("returns services in first-seen order with counts", () => {
    expect(
      runServiceOptions([
        run("hackernews-1", "news.get_best_stories", "hackernews"),
        run("gmail-1", "mail.search_threads", "gmail"),
        run("hackernews-2", "news.get_top_stories", "hackernews"),
        run("gmail-1", "mail.search_threads", "gmail"),
      ]),
    ).toEqual([
      { service: "hackernews", count: 2 },
      { service: "gmail", count: 1 },
    ]);
  });
});

describe("runMemberOptions", () => {
  it("returns distinct member ids with counts", () => {
    const a = { ...run("r1", "a.x", "a"), memberId: "member-aaa" };
    const b = { ...run("r2", "a.y", "a"), memberId: "member-bbb" };
    const c = { ...run("r3", "a.z", "a"), memberId: "member-aaa" };
    const none = run("r4", "a.z", "a");
    expect(runMemberOptions([a, b, c, none, a])).toEqual([
      { memberId: "member-aaa", count: 2 },
      { memberId: "member-bbb", count: 1 },
    ]);
    expect(formatMemberOptionLabel({ memberId: "7ee7c1737eba99dfb33d1969", count: 3 })).toContain("7ee7c173");
  });
});

describe("runListPath", () => {
  it("adds the selected service to run API requests", () => {
    expect(runListPath({ filters: filters({ service: "gmail" }) })).toBe("/api/runs?limit=50&service=gmail");
  });

  it("keeps all filters while paginating", () => {
    expect(
      runListPath({
        cursor: "next cursor",
        filters: filters({
          service: "gmail",
          actionId: "gmail.search_threads",
          caller: "mcp",
          ok: false,
          memberId: "mem-1",
        }),
      }),
    ).toBe(
      "/api/runs?limit=50&cursor=next+cursor&service=gmail&actionId=gmail.search_threads&caller=mcp&ok=false&memberId=mem-1",
    );
  });
});

describe("runFiltersFromSearchParams", () => {
  it("reads structured filters from the URL query", () => {
    expect(
      runFiltersFromSearchParams(
        new URLSearchParams("service=hackernews&actionId=hackernews.get_item&caller=mcp&ok=false&memberId=mem-xyz"),
      ),
    ).toEqual({
      service: "hackernews",
      actionId: "hackernews.get_item",
      caller: "mcp",
      ok: false,
      memberId: "mem-xyz",
    });
  });
});

describe("RunsPage", () => {
  it("keeps filters visible when no runs match", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RunsPage, { initialRuns: [] })),
    );

    expect(markup).toContain("runs-toolbar");
    expect(markup).toContain("runs.action");
    expect(markup).toContain("runs.member");
    expect(markup).toContain("runs.noRunsTitle");
  });

  it("renders six audit columns and connection context", () => {
    const auditRun = {
      ...run("execution-1", "gmail.search_threads", "gmail"),
      connectionProfile: { displayName: "Finance workspace" },
      outputSummary: { threadCount: 2 },
    };
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RunsPage, { initialRuns: [auditRun] })),
    );

    for (const heading of ["action", "context", "status", "timing", "input", "result"]) {
      expect(markup).toContain(`runs.table.${heading}`);
    }
    const headings = ["timing", "status", "action", "context", "input", "result"].map((heading) =>
      markup.indexOf(`runs.table.${heading}`),
    );
    expect(headings).toEqual([...headings].sort((left, right) => left - right));
    expect(markup).toContain("Finance workspace");
    expect(markup).toContain("threadCount");
    expect(markup).toContain("execution-1");
  });

  it("offers inline expansion for long successful results", () => {
    const auditRun = {
      ...run("execution-long", "hackernews.get_latest_posts", "hackernews"),
      outputSummary: { hits: Array.from({ length: 20 }, (_, index) => ({ id: index, title: `Story ${index}` })) },
    };
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RunsPage, { initialRuns: [auditRun] })),
    );

    expect(markup).toContain('aria-label="runs.expandResult"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders both the stable error code and safe error message", () => {
    const failedRun = {
      ...run("execution-2", "gmail.search_threads", "gmail"),
      ok: false,
      errorCode: "rate_limited",
      errorMessage: "The provider rate limit was reached.",
    };
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RunsPage, { initialRuns: [failedRun] })),
    );

    expect(markup).toContain("rate_limited");
    expect(markup).toContain("The provider rate limit was reached.");
  });

  it("renders policy and stored token context without adding a table column", () => {
    const auditRun: RunLog = {
      ...run("execution-policy", "github.delete_repository", "github"),
      ok: false,
      runtimeTokenId: "token-1",
      policy: {
        allowed: false,
        checks: [{ source: "token", outcome: "block_match", rule: "github.delete_repository" }],
      },
    };
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(RunsPage, { initialRuns: [auditRun] })),
    );

    expect(markup).toContain("runs.policyBlocked");
    expect(markup).toContain("access.policy.sources.token: github.delete_repository");
    expect(markup).toContain("runs.runtimeToken: token-1");
    expect(markup).not.toContain("runs.table.policy");
  });
});

function filters(input: Partial<ReturnType<typeof runFiltersFromSearchParams>> = {}) {
  return { service: null, actionId: "", caller: null, ok: null, memberId: null, ...input };
}

function run(id: string, actionId: string, service: string): RunLog {
  return {
    id,
    service,
    actionId,
    caller: "http",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok: true,
    inputSummary: {},
  };
}
