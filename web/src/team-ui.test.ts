import { describe, expect, it } from "vitest";
import { CONNECTION_STATUS_LABELS } from "./connections-page";
import { OVERVIEW_SECTION_IDS } from "./overview-page";
import {
  ALL_TEAMS_ID,
  accountStatusLabel,
  accountStatusTone,
  canSubmitCreateTeam,
  formatTeamIdSnippet,
  isAllTeamsView,
  isValidTeamName,
  orgRoleHelp,
  orgRoleLabel,
  resolveActiveTeamId,
  resolveMembershipTeamId,
  roleLabel,
  TEAM_TABLE_COLUMNS,
  teamNavTarget,
  teamTableColumnLabels,
} from "./team-ui";
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
  it("exposes membership columns without connection ACL (English source)", () => {
    expect(teamTableColumnLabels("en")).toEqual(["User", "Team role", "Account status", "Actions"]);
    expect(TEAM_TABLE_COLUMNS.map((c) => c.id)).toEqual(["user", "role", "status", "actions"]);
  });
});

describe("role badges (English)", () => {
  it("labels enterprise and team roles", () => {
    expect(orgRoleLabel("admin")).toBe("Org admin");
    expect(orgRoleLabel("auditor")).toBe("Auditor");
    expect(orgRoleLabel("member")).toBe("Member");
    expect(roleLabel("creator")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Team admin");
    expect(roleLabel("member")).toBe("Member");
  });

  it("explains enterprise roles in plain language", () => {
    expect(orgRoleHelp("auditor")).toMatch(/Read-only|audit/i);
    expect(orgRoleHelp("admin")).toMatch(/admin|accounts|settings/i);
    expect(orgRoleHelp("member")).toMatch(/Colleague|team/i);
  });
});

describe("account lifecycle labels", () => {
  it("maps pending/active/deactivated to English labels", () => {
    expect(accountStatusLabel("pending")).toBe("Pending");
    expect(accountStatusLabel("active")).toBe("Active");
    expect(accountStatusLabel("deactivated")).toBe("Deactivated");
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

  it("secondary sidebar includes tools without standalone actions nav", () => {
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

  it("teamNavTarget: company-wide → directory; concrete team → membership", () => {
    expect(teamNavTarget(ALL_TEAMS_ID, [{ id: "sales" }])).toBe("/org/teams");
    expect(teamNavTarget(ALL_TEAMS_ID, [])).toBe("/org/teams");
    expect(teamNavTarget("sales", [{ id: "sales" }])).toBe("/team?team=sales");
    expect(teamNavTarget(undefined, [])).toBe("/team");
  });
});

describe("overview + connections structural markers", () => {
  it("overview sections include capability and usage", () => {
    expect([...OVERVIEW_SECTION_IDS]).toEqual(["observability", "capability", "team-usage", "personal-usage"]);
  });

  it("connections status chips match product labels (English source)", () => {
    expect([...CONNECTION_STATUS_LABELS]).toEqual(["All", "Configured", "Needs attention", "Ready to use"]);
  });
});
