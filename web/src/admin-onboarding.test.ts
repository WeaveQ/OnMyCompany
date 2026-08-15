import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { buildAdminOnboardingChecklist } from "./admin-onboarding";
import { AdminOnboardingChecklist } from "./overview-page";

describe("admin onboarding checklist", () => {
  it("model step is Omni probe + external router link, not a model catalog", () => {
    const steps = buildAdminOnboardingChecklist({
      memberCount: 1,
      teamReady: true,
      connectionCount: 1,
      skillCount: 0,
      hasPolicy: true,
      modelRouterOk: true,
      modelRouterDashboardUrl: "http://127.0.0.1:20128/dashboard",
      runtimeTokenCount: 0,
    });
    const model = steps.find((s) => s.id === "model-router");
    expect(model).toMatchObject({
      done: true,
      external: true,
      href: "http://127.0.0.1:20128/dashboard",
    });
    expect(model?.to).toBeUndefined();
    expect(model?.hint.toLowerCase()).toContain("omni");

    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, {}, createElement(AdminOnboardingChecklist, { steps })),
    );
    expect(markup).toContain('data-testid="admin-onboarding"');
    expect(markup).toContain('data-testid="onboarding-step-model-router"');
    expect(markup).toContain('data-testid="onboarding-model-router-link"');
    expect(markup).toContain("http://127.0.0.1:20128/dashboard");
    expect(markup).not.toContain("Embedding");
    expect(markup).not.toMatch(/vendor card|OpenAI Chat Completions/i);
  });
});
