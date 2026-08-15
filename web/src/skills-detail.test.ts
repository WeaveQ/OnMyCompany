import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillDetailView } from "./skills-page";

describe("Skills detail UI", () => {
  it("renders SKILL.md body and metadata without an orchestrator", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillDetailView, {
        detail: {
          meta: {
            packageId: "omc-hello@1.0.0",
            name: "Hello Team",
            version: "1.0.0",
            enabledBy: "member-1",
            source: "seed",
          },
          skillMd: "# Hello Team\n\nA sample org skill package.\n",
        },
      }),
    );
    expect(markup).toContain("skills-detail-body");
    expect(markup).toContain("skills-detail-md");
    expect(markup).toContain("# Hello Team");
    expect(markup).toContain("v1.0.0");
    expect(markup).toContain("added by member-1");
    expect(markup.toLowerCase()).not.toContain("orchestrat");
    expect(markup).not.toContain("dag");

    const src = readFileSync(join(import.meta.dirname, "skills-page.tsx"), "utf8");
    expect(src).toContain("/api/catalog/skills/");
    expect(src).not.toMatch(/node editor|react-flow|dag editor/i);
  });
});
