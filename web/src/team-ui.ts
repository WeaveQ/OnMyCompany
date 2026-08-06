/**
 * Pure helpers for team console UI (testable without React).
 * Matches create-team modal rules from product reference screenshots.
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
  labelZh: string;
  labelEn: string;
}

/** Team membership table columns (no connection ACL — enterprise-shared until Phase 3). */
export const TEAM_TABLE_COLUMNS: readonly TeamTableColumn[] = [
  { id: "user", labelZh: "用户", labelEn: "User" },
  { id: "role", labelZh: "团队角色", labelEn: "Team role" },
  { id: "status", labelZh: "账号状态", labelEn: "Account status" },
  { id: "actions", labelZh: "操作", labelEn: "Actions" },
] as const;

/** Assignable roles in the member role menu (creator is locked). */
export const TEAM_ASSIGNABLE_ROLES = [
  { id: "member", labelZh: "团队成员", labelEn: "Member" },
  { id: "admin", labelZh: "团队管理员", labelEn: "Team admin" },
] as const;

export function teamTableColumnLabels(lang: "zh" | "en" = "zh"): string[] {
  return TEAM_TABLE_COLUMNS.map((c) => (lang === "en" ? c.labelEn : c.labelZh));
}

/** Team-scoped role badge (creator / team admin / member). */
export function roleLabelZh(role: string): string {
  if (role === "creator") return "团队所有者";
  if (role === "admin") return "团队管理员";
  if (role === "auditor") return "团队观察者";
  return "团队成员";
}

/** Enterprise account role badge (org layer). */
export function orgRoleLabelZh(role: string): string {
  if (role === "admin" || role === "owner") return "企业管理员";
  if (role === "auditor") return "企业审计";
  return "员工";
}

/** One-line help under role select (product copy). */
export function orgRoleHelpZh(role: string): string {
  if (role === "admin" || role === "owner") {
    return "公司管家人：可管账号、建队、改企业设置。";
  }
  if (role === "auditor") {
    return "只看不改：可查全公司审计/用量，不能改账号或配置。";
  }
  return "普通同事：先入企业账号，再在「团队」里入队。";
}

export function orgRolesLabelZh(roles: readonly string[] | undefined): string {
  if (!roles?.length) return "员工";
  return roles.map(orgRoleLabelZh).join(" · ");
}

/** Account lifecycle shown on people list (replaces 本团队/组织全员 dual mental model). */
export type AccountLifecycle = "pending" | "active" | "deactivated";

export function accountStatusLabelZh(status: string | undefined): string {
  if (status === "pending") return "未激活";
  if (status === "deactivated") return "已停用";
  if (status === "已禁用") return "已禁用";
  return "已启用";
}

export function accountStatusTone(status: string | undefined): "ok" | "warn" | "muted" {
  if (status === "pending") return "warn";
  if (status === "deactivated" || status === "已禁用") return "muted";
  return "ok";
}

/** Sentinel for org-admin / auditor「全公司」view (not a real team id). */
export const ALL_TEAMS_ID = "__all__";

export function isAllTeamsView(teamId?: string | null): boolean {
  return teamId === ALL_TEAMS_ID;
}

/**
 * Pick active team id: prefer stored/url if still in list, else first team.
 * Product rule: after ensureDefaultTeam, list is never empty for an authed member.
 * `preferredId === ALL_TEAMS_ID` is preserved for elevated「全公司」view.
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
 * Never returns `ALL_TEAMS_ID` — that sentinel is not a team resource and
 * `GET /api/teams/__all__/members` is invalid (403).
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
 * Single primary「团队」nav target:
 * - 全公司 → 团队列表（建队 / 点进各队）
 * - 具体队 → 本队成员
 * Directory stays at `/org/teams` but is not a separate sidebar item.
 */
export function teamNavTarget(
  activeTeamId: string | undefined | null,
  teams: ReadonlyArray<{ id: string }>,
): string {
  if (isAllTeamsView(activeTeamId)) {
    return "/org/teams";
  }
  if (activeTeamId && teams.some((t) => t.id === activeTeamId)) {
    return `/team?team=${encodeURIComponent(activeTeamId)}`;
  }
  return "/team";
}

/** Short id snippet for switcher / manage header (OOMOL-style). */
export function formatTeamIdSnippet(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
