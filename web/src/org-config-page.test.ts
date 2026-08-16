import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("OrgConfigPage human IA", () => {
  const src = readFileSync(join(import.meta.dirname, "org-config-page.tsx"), "utf8");

  it("explains purpose and links away from secrets/people", () => {
    expect(src).toContain("企业设置");
    expect(src).toContain("公司下发给所有 Agent");
    expect(src).toContain("/connections");
    expect(src).toContain("/team");
    expect(src).toContain("/skills");
  });

  it("uses form-first policy fields not only raw JSON", () => {
    expect(src).toContain("policy-allowed");
    expect(src).toContain("policy-blocked");
    expect(src).toContain("policy-egress");
    expect(src).toContain("allowPersonalBYOK");
    expect(src).toMatch(/展开|收起.*高级/);
    expect(src).toContain("policy JSON");
  });

  it("hides models JSON behind advanced and documents no API keys", () => {
    expect(src).toContain("不存放 API Key");
    expect(src).toContain("models JSON");
    expect(src).toContain("omni-models-note");
    expect(src).toContain("omni-models-link");
    expect(src).toContain("orgConfigPage.omniNote");
  });
});
