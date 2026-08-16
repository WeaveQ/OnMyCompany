import { I18nProvider } from "@embra/i18n/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import { ToolsCatalogList } from "./tools-page";

describe("Tools catalog UI", () => {
  it("lists org MCP and gateway declarations and does not spawn processes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(ToolsCatalogList, {
          data: {
            mcp: { servers: [{ name: "github-mcp", command: "npx" }] },
            gateway: { services: ["github"] },
            aliases: [{ alias: "GH", fields: ["service"] }],
          },
        }),
      ),
    );
    expect(markup).toContain("tools-catalog");
    expect(markup).toContain("github-mcp");
    expect(markup).toContain("github");
    expect(markup).toContain("does not spawn or npx");
    expect(markup).not.toMatch(/child_process|spawn\(/);

    const src = readFileSync(join(import.meta.dirname, "tools-page.tsx"), "utf8");
    expect(src).toContain("/api/org/tools");
    expect(src).not.toMatch(/child_process|spawn\(|exec\(/);
  });
});
