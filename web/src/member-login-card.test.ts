import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared MemberLoginCard usage", () => {
  const card = readFileSync(join(import.meta.dirname, "member-login-card.tsx"), "utf8");
  const skills = readFileSync(join(import.meta.dirname, "skills-page.tsx"), "utf8");
  const team = readFileSync(join(import.meta.dirname, "team-manage-page.tsx"), "utf8");
  const org = readFileSync(join(import.meta.dirname, "org-config-page.tsx"), "utf8");

  it("exports MemberLoginCard", () => {
    expect(card).toContain("export function MemberLoginCard");
    expect(card).toContain("member-login-card");
  });

  it("skills/team/org-config reuse MemberLoginCard", () => {
    expect(skills).toContain("MemberLoginCard");
    expect(team).toContain("MemberLoginCard");
    expect(org).toContain("MemberLoginCard");
  });

  it("skills and experts silent-bootstrap like members (no extra wall after console unlock)", () => {
    const experts = readFileSync(join(import.meta.dirname, "experts-page.tsx"), "utf8");
    expect(skills).toContain("ensureMemberSessionForConsole");
    expect(experts).toContain("ensureMemberSessionForConsole");
  });

  it("skills page uses page-hero and list classes not only inline layout dumps", () => {
    expect(skills).toContain("page-hero-title");
    expect(skills).toContain("skills-row");
    expect(skills).toContain("skills-modal");
  });
});
