import { I18nProvider } from "@embra/i18n/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpertDetailView, ExpertRow } from "./experts-page";
import { createAppI18n } from "./i18n";

function renderZh(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(createElement(I18nProvider, { i18n: createAppI18n("zh-CN") }, node));
}

describe("Experts page", () => {
  it("aligns with Skills: details + remove, no chat CTA", () => {
    const markup = renderZh(
      createElement(ExpertRow, {
        item: { packageId: "ops-oncall@1.0.0", name: "Ops on-call", installed: true },
        isAdmin: true,
        onDetail() {},
        onRemove() {},
      }),
    );
    expect(markup).toContain("expert-detail");
    expect(markup).toContain("expert-remove");
    expect(markup).toContain("skills-row");
    expect(markup).not.toMatch(/start chat/i);
    expect(markup).not.toContain("expert-enable");
  });

  it("detail view shows README body", () => {
    const markup = renderZh(
      createElement(ExpertDetailView, {
        name: "Ops on-call",
        packageId: "ops-oncall@1.0.0",
        readme: "# Ops on-call\n\nTriage pack.\n",
      }),
    );
    expect(markup).toContain("expert-detail-md");
    expect(markup).toContain("# Ops on-call");
  });

  it("page has add/upload like Skills", () => {
    const src = readFileSync(join(import.meta.dirname, "experts-page.tsx"), "utf8");
    expect(src).toContain("experts-add");
    expect(src).toContain("/api/org/experts/upload");
    expect(src).toContain("skills-list-card");
    expect(src).toContain("scope=org");
    expect(src).not.toContain("window.prompt");
  });
});
