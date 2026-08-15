import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpertRow } from "./experts-page";

describe("Experts page", () => {
  it("enable/remove controls have no company-chat CTA", () => {
    const enabled = renderToStaticMarkup(
      createElement(ExpertRow, {
        item: { packageId: "ops-oncall@1.0.0", name: "Ops on-call", installed: true },
        isAdmin: true,
        onEnable() {},
        onDisable() {},
      }),
    );
    expect(enabled).toContain("expert-remove");
    expect(enabled).not.toMatch(/start chat|Start chat|chat CTA/i);

    const available = renderToStaticMarkup(
      createElement(ExpertRow, {
        item: { packageId: "sales-brief@1.0.0", name: "Sales brief", installed: false },
        isAdmin: true,
        onEnable() {},
        onDisable() {},
      }),
    );
    expect(available).toContain("expert-enable");
    expect(available).not.toMatch(/start chat/i);
  });

  it("page source has no window.prompt and no chat action", () => {
    const src = readFileSync(join(import.meta.dirname, "experts-page.tsx"), "utf8");
    expect(src).not.toContain("window.prompt");
    expect(src).not.toMatch(/start chat/i);
    expect(src).toContain("/api/org/experts/enable");
    expect(src).toContain("/api/org/experts/disable");
  });
});
