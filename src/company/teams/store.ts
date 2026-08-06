import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type TeamMemberRole = "admin" | "member" | "auditor" | "creator";

export interface TeamRecord {
  id: string;
  name: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMembership {
  teamId: string;
  memberId: string;
  role: TeamMemberRole;
  status: "active" | "disabled";
  joinedAt: string;
}

interface TeamsFile {
  teams: TeamRecord[];
  memberships: TeamMembership[];
}

const NAME_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;

export class TeamsStore {
  private readonly filePath: string;
  private cache: TeamsFile | undefined;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "teams.json");
  }

  async listTeamsForMember(memberId: string): Promise<TeamRecord[]> {
    const data = await this.read();
    const teamIds = new Set(
      data.memberships.filter((m) => m.memberId === memberId && m.status === "active").map((m) => m.teamId),
    );
    return data.teams.filter((t) => teamIds.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listAllTeams(): Promise<TeamRecord[]> {
    return [...(await this.read()).teams];
  }

  async getTeam(teamId: string): Promise<TeamRecord | undefined> {
    return (await this.read()).teams.find((t) => t.id === teamId);
  }

  async createTeam(input: { name: string; avatarUrl?: string; createdBy: string }): Promise<TeamRecord> {
    const name = input.name.trim();
    if (!NAME_PATTERN.test(name)) {
      throw new TeamsError("validation_error", "Team name: English letters, digits, . _ - only (2–64)");
    }
    const data = await this.read();
    if (data.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new TeamsError("conflict", "Team name already exists");
    }
    const now = new Date().toISOString();
    const team: TeamRecord = {
      id: randomBytes(12).toString("hex"),
      name,
      avatarUrl: input.avatarUrl?.trim() || undefined,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    data.teams.push(team);
    data.memberships.push({
      teamId: team.id,
      memberId: input.createdBy,
      role: "creator",
      status: "active",
      joinedAt: now,
    });
    await this.write(data);
    return team;
  }

  async updateTeam(teamId: string, patch: { name?: string; avatarUrl?: string }): Promise<TeamRecord> {
    const data = await this.read();
    const team = data.teams.find((t) => t.id === teamId);
    if (!team) throw new TeamsError("not_found", "Team not found");
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!NAME_PATTERN.test(name)) {
        throw new TeamsError("validation_error", "Invalid team name");
      }
      if (data.teams.some((t) => t.id !== teamId && t.name.toLowerCase() === name.toLowerCase())) {
        throw new TeamsError("conflict", "Team name already exists");
      }
      team.name = name;
    }
    if (patch.avatarUrl !== undefined) {
      team.avatarUrl = patch.avatarUrl.trim() || undefined;
    }
    team.updatedAt = new Date().toISOString();
    await this.write(data);
    return team;
  }

  async listMemberships(teamId: string): Promise<TeamMembership[]> {
    return (await this.read()).memberships.filter((m) => m.teamId === teamId);
  }

  async getMembership(teamId: string, memberId: string): Promise<TeamMembership | undefined> {
    return (await this.read()).memberships.find((m) => m.teamId === teamId && m.memberId === memberId);
  }

  async addMember(input: { teamId: string; memberId: string; role?: TeamMemberRole }): Promise<TeamMembership> {
    const data = await this.read();
    if (!data.teams.some((t) => t.id === input.teamId)) {
      throw new TeamsError("not_found", "Team not found");
    }
    const existing = data.memberships.find((m) => m.teamId === input.teamId && m.memberId === input.memberId);
    if (existing) {
      if (existing.status === "disabled") {
        existing.status = "active";
        existing.role = input.role ?? existing.role;
        await this.write(data);
      }
      return existing;
    }
    const membership: TeamMembership = {
      teamId: input.teamId,
      memberId: input.memberId,
      role: input.role === "creator" ? "admin" : (input.role ?? "member"),
      status: "active",
      joinedAt: new Date().toISOString(),
    };
    data.memberships.push(membership);
    await this.write(data);
    return membership;
  }

  /** Update role for an existing member (cannot demote/reassign creator). */
  async updateMemberRole(input: { teamId: string; memberId: string; role: TeamMemberRole }): Promise<TeamMembership> {
    const data = await this.read();
    const membership = data.memberships.find((m) => m.teamId === input.teamId && m.memberId === input.memberId);
    if (!membership) {
      throw new TeamsError("not_found", "Membership not found");
    }
    if (membership.role === "creator") {
      throw new TeamsError("forbidden", "Creator role cannot be changed");
    }
    if (input.role === "creator") {
      throw new TeamsError("validation_error", "Cannot assign creator role");
    }
    membership.role = input.role;
    await this.write(data);
    return membership;
  }

  /** Remove a member from the team (creator cannot be removed). */
  async removeMember(input: { teamId: string; memberId: string }): Promise<void> {
    const data = await this.read();
    const idx = data.memberships.findIndex((m) => m.teamId === input.teamId && m.memberId === input.memberId);
    if (idx < 0) {
      throw new TeamsError("not_found", "Membership not found");
    }
    if (data.memberships[idx]!.role === "creator") {
      throw new TeamsError("forbidden", "Creator cannot be removed");
    }
    data.memberships.splice(idx, 1);
    await this.write(data);
  }

  async isTeamAdmin(teamId: string, memberId: string): Promise<boolean> {
    const m = await this.getMembership(teamId, memberId);
    return Boolean(m && m.status === "active" && (m.role === "admin" || m.role === "creator"));
  }

  /**
   * Ensure the member has at least one team (personal workspace).
   * Product rule: first login always lands in their own team (like OOMOL),
   * never join someone else's first team by default.
   */
  async ensureDefaultTeam(input: { name: string; createdBy: string }): Promise<TeamRecord> {
    const mine = await this.listTeamsForMember(input.createdBy);
    if (mine.length > 0) {
      return mine[0]!;
    }
    const base = personalTeamName(input.name);
    const unique = await this.allocateUniqueTeamName(base);
    return this.createTeam({
      name: unique,
      createdBy: input.createdBy,
    });
  }

  /** Allocate a unique team name; appends _2, _3, … on collision. */
  private async allocateUniqueTeamName(base: string): Promise<string> {
    const data = await this.read();
    const taken = new Set(data.teams.map((t) => t.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) {
      return base;
    }
    for (let n = 2; n < 1000; n += 1) {
      const candidate = `${base.slice(0, Math.max(1, 64 - `_${n}`.length))}_${n}`;
      if (!taken.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${base.slice(0, 48)}_${randomBytes(4).toString("hex")}`;
  }

  private async read(): Promise<TeamsFile> {
    if (this.cache) return structuredClone(this.cache);
    try {
      await access(this.filePath);
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as TeamsFile;
      this.cache = { teams: raw.teams ?? [], memberships: raw.memberships ?? [] };
    } catch {
      this.cache = { teams: [], memberships: [] };
    }
    return structuredClone(this.cache);
  }

  private async write(data: TeamsFile): Promise<void> {
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    this.cache = structuredClone(data);
  }
}

export class TeamsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Exported for tests: sanitize display/email into a valid team name seed. */
export function sanitizeDefaultName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length >= 2 ? cleaned.slice(0, 64) : "default_team";
}

/**
 * Personal default team name (OOMOL-style: `{local}_team`).
 * Exported for unit tests.
 */
export function personalTeamName(name: string): string {
  const base = sanitizeDefaultName(name);
  if (base.endsWith("_team") || base.length >= 12) {
    return base.slice(0, 64);
  }
  return `${base}_team`.slice(0, 64);
}
