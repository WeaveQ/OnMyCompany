/**
 * Pure helpers for team console UI (testable without React).
 * Source-of-truth labels are English (OMA-style). zh/zh-TW live in locale files.
 */

/** Shared team row used by shell switcher + manage page + create modal. */
export interface TeamRecord {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Present for API teams; optional when only id/name known in UI state. */
  createdBy?: string;
}

/** English letters, digits, dot, underscore, hyphen; length 2–64. */
export const TEAM_NAME_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;

export function isValidTeamName(name: string): boolean {
  return TEAM_NAME_PATTERN.test(name.trim());
}

/** Submit enabled only when name is valid (avatar optional). */
export function canSubmitCreateTeam(name: string): boolean {
  return isValidTeamName(name);
}

export type TeamTableColumnId = "user" | "role" | "status" | "actions";

export interface TeamTableColumn {
  id: TeamTableColumnId;
  label: string;
  /** @deprecated use label */
  labelEn: string;
  /** @deprecated zh lives in locales */
  labelZh: string;
}

/** Team membership table columns (no connection ACL — enterprise-shared until Phase 3). */
export const TEAM_TABLE_COLUMNS: readonly TeamTableColumn[] = [
  { id: "user", label: "User", labelEn: "User", labelZh: "用户" },
  { id: "role", label: "Team role", labelEn: "Team role", labelZh: "团队角色" },
  { id: "status", label: "Account status", labelEn: "Account status", labelZh: "账号状态" },
  { id: "actions", label: "Actions", labelEn: "Actions", labelZh: "操作" },
] as const;

/** Assignable roles in the member role menu (creator is locked). */
export const TEAM_ASSIGNABLE_ROLES = [
  { id: "member", label: "Member", labelEn: "Member", labelZh: "团队成员" },
  { id: "admin", label: "Team admin", labelEn: "Team admin", labelZh: "团队管理员" },
] as const;

export function teamTableColumnLabels(lang: "zh" | "en" = "en"): string[] {
  return TEAM_TABLE_COLUMNS.map((c) => (lang === "zh" ? c.labelZh : c.label));
}

/** Team-scoped role badge (creator / team admin / member). English source. */
export function roleLabel(role: string): string {
  if (role === "creator") return "Owner";
  if (role === "admin") return "Team admin";
  if (role === "auditor") return "Team auditor";
  return "Member";
}

/** @deprecated use roleLabel */
export const roleLabelZh = roleLabel;

/** Enterprise account role badge (org layer). */
export function orgRoleLabel(role: string): string {
  if (role === "admin" || role === "owner") return "Org admin";
  if (role === "auditor") return "Auditor";
  return "Member";
}

/** @deprecated use orgRoleLabel */
export const orgRoleLabelZh = orgRoleLabel;

/** One-line help under role select (product copy). */
export function orgRoleHelp(role: string): string {
  if (role === "admin" || role === "owner") {
    return "Company admin: manage accounts, create teams, change enterprise settings.";
  }
  if (role === "auditor") {
    return "Read-only: can view company-wide audit and usage; cannot change accounts or config.";
  }
  return "Colleague: has an org account; join a team from Team.";
}

/** @deprecated use orgRoleHelp */
export const orgRoleHelpZh = orgRoleHelp;

export function orgRolesLabel(roles: readonly string[] | undefined): string {
  if (!roles?.length) return "Member";
  return roles.map(orgRoleLabel).join(" · ");
}

/** @deprecated use orgRolesLabel */
export const orgRolesLabelZh = orgRolesLabel;

/** Account lifecycle shown on people list. */
export type AccountLifecycle = "pending" | "active" | "deactivated";

export function accountStatusLabel(status: string | undefined): string {
  if (status === "pending" || status === "未激活") return "Pending";
  if (status === "deactivated" || status === "已停用") return "Deactivated";
  if (status === "已禁用" || status === "Disabled") return "Disabled";
  if (status === "Active" || status === "已启用" || status === "正常") return "Active";
  if (status === "Pending" || status === "Deactivated") return status;
  return "Active";
}

/** @deprecated use accountStatusLabel */
export const accountStatusLabelZh = accountStatusLabel;

export function accountStatusTone(status: string | undefined): "ok" | "warn" | "muted" {
  const label = accountStatusLabel(status);
  if (label === "Pending") return "warn";
  if (label === "Deactivated" || label === "Disabled") return "muted";
  if (status === "pending") return "warn";
  if (status === "deactivated" || status === "已禁用") return "muted";
  return "ok";
}

/** Sentinel for org-admin / auditor company-wide view (not a real team id). */
export const ALL_TEAMS_ID = "__all__";

export function isAllTeamsView(teamId?: string | null): boolean {
  return teamId === ALL_TEAMS_ID;
}

/**
 * Pick active team id: prefer stored/url if still in list, else first team.
 * Product rule: after ensureDefaultTeam, list is never empty for an authed member.
 * `preferredId === ALL_TEAMS_ID` is preserved for elevated company-wide view.
 */
export function resolveActiveTeamId(
  teams: ReadonlyArray<{ id: string }>,
  preferredId?: string | null,
): string | undefined {
  if (preferredId === ALL_TEAMS_ID) return ALL_TEAMS_ID;
  if (teams.length === 0) return undefined;
  if (preferredId && teams.some((t) => t.id === preferredId)) {
    return preferredId;
  }
  return teams[0]!.id;
}

/**
 * Resolve a **real** team id for current-team membership UI (`/team`).
 * Never returns `ALL_TEAMS_ID`.
 */
export function resolveMembershipTeamId(
  teams: ReadonlyArray<{ id: string }>,
  preferredId?: string | null,
): string | undefined {
  if (teams.length === 0) return undefined;
  if (preferredId && preferredId !== ALL_TEAMS_ID && teams.some((t) => t.id === preferredId)) {
    return preferredId;
  }
  return teams[0]!.id;
}

/**
 * Single primary Team nav target:
 * - Company-wide → team directory
 * - Concrete team → membership page
 */
export function teamNavTarget(activeTeamId: string | undefined | null, teams: ReadonlyArray<{ id: string }>): string {
  if (isAllTeamsView(activeTeamId)) {
    return "/org/teams";
  }
  if (activeTeamId && teams.some((t) => t.id === activeTeamId)) {
    return `/team?team=${encodeURIComponent(activeTeamId)}`;
  }
  return "/team";
}

/** Short id snippet for switcher / manage header. */
export function formatTeamIdSnippet(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
