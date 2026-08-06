import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * People IA (Phase 1):
 * 企业账号 = org accounts lifecycle
 * 团队 = current-team membership
 * 团队列表 = org team directory
 */
describe("people IA (accounts vs team vs directory)", () => {
  const membersSrc = readFileSync(join(import.meta.dirname, "members-page.tsx"), "utf8");
  const teamSrc = readFileSync(join(import.meta.dirname, "team-manage-page.tsx"), "utf8");
  const orgTeamsSrc = readFileSync(join(import.meta.dirname, "org-teams-page.tsx"), "utf8");
  const uiSrc = readFileSync(join(import.meta.dirname, "ui.tsx"), "utf8");

  it("members is company-account SoT with org member APIs", () => {
    expect(membersSrc).toContain("export function MembersPage");
    expect(membersSrc).toContain('"/api/org/members"');
    expect(membersSrc).toContain('data-testid="members-page"');
    expect(membersSrc).toContain("企业账号");
    expect(membersSrc).toMatch(/status:\s*"deactivated"/);
    expect(uiSrc).toContain('path: "/members"');
    expect(uiSrc).toContain("MembersPage");
  });

  it("team page is membership-only (no org lifecycle APIs)", () => {
    expect(teamSrc).toContain('data-testid="people-filters"');
    expect(teamSrc).toContain("/api/teams/");
    expect(teamSrc).toContain("加入本队");
    expect(teamSrc).toContain("team-add-from-pool");
    // Org account lifecycle must not live on the team page
    expect(teamSrc).not.toContain('apiPut(`/api/org/members/');
    expect(teamSrc).not.toContain('apiDelete(`/api/org/members/');
    expect(teamSrc).not.toContain("person-edit-org-role");
    expect(teamSrc).not.toContain("已停用账号（会话与 runtime token 已吊销）");
  });

  it("team page never uses ALL_TEAMS_ID as membership resource id", () => {
    expect(teamSrc).toContain("resolveMembershipTeamId");
    expect(teamSrc).toContain("isAllTeamsView");
    // Must not resolve membership via resolveActiveTeamId (preserves __all__)
    expect(teamSrc).not.toContain("resolveActiveTeamId");
    expect(uiSrc).toContain("teamNavTarget");
  });

  it("org teams directory is routed (not a separate sidebar item) and can create/open teams", () => {
    expect(orgTeamsSrc).toContain("export function OrgTeamsPage");
    expect(orgTeamsSrc).toContain('data-testid="org-teams-page"');
    expect(orgTeamsSrc).toContain("创建团队");
    expect(orgTeamsSrc).toContain("/team?team=");
    // Route kept; primary nav only lists /team (merged menu)
    expect(uiSrc).toContain("OrgTeamsPage");
    expect(uiSrc).toContain('path="/org/teams"');
    expect(uiSrc).toContain("teamNavTarget");
    expect(uiSrc).not.toMatch(/path:\s*"\/org\/teams"/);
  });

  it("team switcher supports 全公司 sentinel", () => {
    expect(teamSrc).toContain("ALL_TEAMS_ID");
    expect(teamSrc).toContain("showAllTeams");
    expect(teamSrc).toContain("全公司");
  });
});
