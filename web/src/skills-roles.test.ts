import { I18nProvider } from "@embra/i18n/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import { SkillRolePicker } from "./skills-page";
import { getMoreNavPaths, getPrimaryNavPaths } from "./ui";

describe("Skills role control", () => {
  it("renders a multi-select, not window.prompt", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(SkillRolePicker, {
          packageId: "demo@1",
          selected: ["admin"],
          onClose() {},
          onSave() {},
        }),
      ),
    );
    expect(markup).toContain("skills-role-picker");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("admin");
    expect(markup).toContain("member");
    expect(markup).toContain("auditor");
    expect(markup).not.toContain("prompt(");

    const src = readFileSync(join(import.meta.dirname, "skills-page.tsx"), "utf8");
    expect(src).not.toContain("window.prompt");
    expect(src).toContain("SkillRolePicker");
  });

  it("auditor cannot see Skills add (gated on isAdmin)", () => {
    const src = readFileSync(join(import.meta.dirname, "skills-page.tsx"), "utf8");
    expect(src).toContain('data-testid="skills-add"');
    expect(src).toMatch(/isAdmin \? \(/);
    const members = readFileSync(join(import.meta.dirname, "members-page.tsx"), "utf8");
    expect(members).toContain('data-testid="members-add"');
    expect(members).toContain("isOrgAdmin");
    const org = readFileSync(join(import.meta.dirname, "org-config-page.tsx"), "utf8");
    expect(org).toContain("disabled={loading || !isAdmin}");
  });

  it("auditor sidebar drops accounts and org settings write entries", () => {
    expect(getPrimaryNavPaths(["auditor"])).not.toContain("/members");
    expect(getMoreNavPaths(["auditor"])).not.toContain("/org-config");
    expect(getMoreNavPaths(["auditor"])).toContain("/skills");
  });
});
