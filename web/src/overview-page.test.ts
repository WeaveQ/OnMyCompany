import type { ActionDefinition, AppData, ProviderDefinition, RunLog } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import { OVERVIEW_SECTION_IDS, OverviewPage } from "./overview-page";

describe("OverviewPage (enterprise console IA)", () => {
  it("renders page hero and core section markers", () => {
    const markup = renderOverview();
    expect(markup).toContain("page-hero-title");
    expect(markup).toContain("概览");
    for (const id of OVERVIEW_SECTION_IDS) {
      expect(markup).toContain(`data-overview-section="${id}"`);
    }
  });

  it("shows capability tiles linking to connections and actions", () => {
    const markup = renderOverview();
    expect(markup).toContain("能力状态");
    expect(markup).toContain("应用连接");
    expect(markup).toContain("可执行操作");
    expect(markup).toMatch(/href="\/connections"/);
    expect(markup).toMatch(/href="\/connections"/);
  });

  it("does not show recommended connections block", () => {
    const markup = renderOverview();
    expect(markup).not.toContain("推荐先连");
    expect(markup).not.toContain("data-overview-section=\"recommended\"");
  });

  it("does not resurrect legacy English activity panels", () => {
    const markup = renderOverview();
    expect(markup).not.toContain("Run Health");
    expect(markup).not.toContain("Recent Calls");
    expect(markup).not.toContain("Tool Call Trend");
    expect(markup).not.toContain("overview-recent-calls-panel");
    expect(markup).not.toContain("Capability Status");
  });

  it("keeps run detail tables off the overview", () => {
    const markup = renderOverview();
    expect(markup.match(/class="[^"]*summary-table[^"]*"/g) ?? []).toHaveLength(0);
    expect(markup).not.toContain("overview-recent-runs-panel");
  });
});

function renderOverview(data: AppData = overviewData): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(MemoryRouter, {}, createElement(OverviewPage, { data, onRefresh() {} })),
    ),
  );
}

const overviewData: AppData = {
  providers: [
    provider("clock", "Clock", [action("clock.now", true)]),
    provider("github", "GitHub", [action("github.catalog_entry", false)], ["Developer Tools"]),
  ],
  connections: [{ service: "github", authType: "oauth2", metadata: {} }],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [
    run("failed", false),
    run("success-1", true),
    run("success-2", true),
  ],
};

function provider(
  service: string,
  displayName: string,
  actions: ActionDefinition[],
  categories: string[] = [],
): ProviderDefinition {
  return {
    service,
    displayName,
    categories,
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions,
  };
}

function action(id: string, locallyExecutable: boolean): ActionDefinition {
  return {
    id,
    service: id.split(".")[0] ?? "service",
    name: id,
    description: "",
    requiredScopes: [],
    inputSchema: {},
    outputSchema: {},
    execution: {
      locallyExecutable,
      catalogOnly: !locallyExecutable,
      requiredAuthTypes: [],
      noAuthRunnable: true,
      needsCredential: false,
    },
  };
}

function run(id: string, ok: boolean): RunLog {
  return {
    id,
    service: ok ? "hackernews" : "notion",
    actionId: ok ? "hackernews.get_best_stories" : "notion.append_block",
    caller: "web",
    startedAt: "2026-07-06T09:00:00.000Z",
    completedAt: "2026-07-06T09:00:00.727Z",
    durationMs: 727,
    ok,
    inputSummary: {},
  };
}
