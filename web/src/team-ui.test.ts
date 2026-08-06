import { describe, expect, it } from "vitest";
import {
  ALL_TEAMS_ID,
  accountStatusLabelZh,
  accountStatusTone,
  canSubmitCreateTeam,
  formatTeamIdSnippet,
  isAllTeamsView,
  isValidTeamName,
  orgRoleHelpZh,
  orgRoleLabelZh,
  resolveActiveTeamId,
  resolveMembershipTeamId,
  roleLabelZh,
  TEAM_TABLE_COLUMNS,
  teamNavTarget,
  teamTableColumnLabels,
} from "./team-ui";
import { CONNECTION_STATUS_LABELS } from "./connections-page";
import { OVERVIEW_SECTION_IDS } from "./overview-page";
import { getMoreNavPaths, getPrimaryNavPaths } from "./ui";

describe("team name validation (create modal)", () => {
  it("accepts product-legal names", () => {
    expect(isValidTeamName("hopefullstack_team")).toBe(true);
    expect(isValidTeamName("my-team.1")).toBe(true);
    expect(canSubmitCreateTeam("ab")).toBe(true);
  });

  it("rejects invalid names and disables submit", () => {
    expect(isValidTeamName("")).toBe(false);
    expect(isValidTeamName("a")).toBe(false);
    expect(isValidTeamName("中文团队")).toBe(false);
    expect(isValidTeamName("has space")).toBe(false);
    expect(canSubmitCreateTeam("bad name!")).toBe(false);
  });
});

describe("team manage table columns", () => {
  it("exposes membership columns without connection ACL", () => {
    expect(teamTableColumnLabels("zh")).toEqual(["用户", "团队角色", "账号状态", "操作"]);
    expect(TEAM_TABLE_COLUMNS.map((c) => c.id)).toEqual(["user", "role", "status", "actions"]);
  });
});

describe("role badges (zh)", () => {
  it("labels enterprise and team roles", () => {
    expect(orgRoleLabelZh("admin")).toBe("企业管理员");
    expect(orgRoleLabelZh("auditor")).toBe("企业审计");
    expect(orgRoleLabelZh("member")).toBe("员工");
    expect(roleLabelZh("creator")).toBe("团队所有者");
    expect(roleLabelZh("admin")).toBe("团队管理员");
    expect(roleLabelZh("member")).toBe("团队成员");
  });

  it("explains enterprise roles in plain language", () => {
    expect(orgRoleHelpZh("auditor")).toMatch(/只看不改|审计/);
    expect(orgRoleHelpZh("admin")).toMatch(/管账号|企业设置/);
    expect(orgRoleHelpZh("member")).toMatch(/普通|入队/);
  });
});

describe("account lifecycle labels", () => {
  it("maps pending/active/deactivated to zh labels", () => {
    expect(accountStatusLabelZh("pending")).toBe("未激活");
    expect(accountStatusLabelZh("active")).toBe("已启用");
    expect(accountStatusLabelZh("deactivated")).toBe("已停用");
    expect(accountStatusTone("pending")).toBe("warn");
    expect(accountStatusTone("active")).toBe("ok");
    expect(accountStatusTone("deactivated")).toBe("muted");
  });
});

describe("resolveActiveTeamId (default personal team)", () => {
  it("prefers preferred id when still present", () => {
    expect(resolveActiveTeamId([{ id: "a" }, { id: "b" }], "b")).toBe("b");
  });

  it("falls back to first team when preferred is missing", () => {
    expect(resolveActiveTeamId([{ id: "a" }, { id: "b" }], "gone")).toBe("a");
    expect(resolveActiveTeamId([{ id: "a" }], null)).toBe("a");
  });

  it("returns undefined only when list is empty", () => {
    expect(resolveActiveTeamId([], "x")).toBeUndefined();
  });

  it("formats id snippets for switcher", () => {
    expect(formatTeamIdSnippet("short")).toBe("short");
    expect(formatTeamIdSnippet("0123456789abcdef012345")).toMatch(/…/);
  });
});

describe("console IA paths", () => {
  it("primary nav is overview + connections + accounts + team (directory not in sidebar)", () => {
    expect(getPrimaryNavPaths()).toEqual(["/overview", "/connections", "/members", "/team"]);
    expect(getPrimaryNavPaths()).not.toContain("/org/teams");
  });

  it("secondary sidebar includes tools without standalone 操作 nav", () => {
    const more = getMoreNavPaths();
    expect(more).toContain("/skills");
    expect(more).not.toContain("/actions");
    expect(more).toContain("/runs");
    expect(more).toContain("/access");
    expect(more).toContain("/org-config");
  });

  it("ALL_TEAMS_ID is preserved by resolveActiveTeamId", () => {
    expect(resolveActiveTeamId([{ id: "a" }], ALL_TEAMS_ID)).toBe(ALL_TEAMS_ID);
    expect(isAllTeamsView(ALL_TEAMS_ID)).toBe(true);
    expect(isAllTeamsView("a")).toBe(false);
  });

  it("resolveMembershipTeamId never returns ALL_TEAMS_ID", () => {
    expect(resolveMembershipTeamId([{ id: "a" }, { id: "b" }], ALL_TEAMS_ID)).toBe("a");
    expect(resolveMembershipTeamId([{ id: "a" }, { id: "b" }], "b")).toBe("b");
    expect(resolveMembershipTeamId([{ id: "a" }], "gone")).toBe("a");
    expect(resolveMembershipTeamId([], ALL_TEAMS_ID)).toBeUndefined();
  });

  it("teamNavTarget: 全公司 → directory; concrete team → membership", () => {
    expect(teamNavTarget(ALL_TEAMS_ID, [{ id: "sales" }])).toBe("/org/teams");
    expect(teamNavTarget(ALL_TEAMS_ID, [])).toBe("/org/teams");
    expect(teamNavTarget("sales", [{ id: "sales" }])).toBe("/team?team=sales");
    expect(teamNavTarget(undefined, [])).toBe("/team");
  });
});

describe("overview + connections structural markers", () => {
  it("overview sections include capability and usage", () => {
    expect([...OVERVIEW_SECTION_IDS]).toEqual([
      "observability",
      "capability",
      "team-usage",
      "personal-usage",
    ]);
  });

  it("connections status chips match product labels", () => {
    expect([...CONNECTION_STATUS_LABELS]).toEqual(["全部", "已配置", "需要处理", "可直接使用"]);
  });
});
