import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type MemberRole = "admin" | "member" | "auditor";
/**
 * Account lifecycle:
 * - pending: invited / created, never completed first login (未激活)
 * - active: can use the product (已启用)
 * - deactivated: admin disabled (已停用)
 */
export type MemberStatus = "pending" | "active" | "deactivated";

export interface MemberRecord {
  id: string;
  email: string;
  displayName: string;
  roles: MemberRole[];
  /** Default active when missing (legacy auth.json). */
  status: MemberStatus;
  createdAt: string;
  /** First successful login (pending → active). */
  activatedAt?: string;
  deactivatedAt?: string;
}

export interface SessionRecord {
  tokenHash: string;
  memberId: string;
  createdAt: string;
  expiresAt: string;
}

export interface OtpRecord {
  email: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
}

interface CompanyAuthFile {
  members: MemberRecord[];
  sessions: SessionRecord[];
  otps: OtpRecord[];
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 15 * 60 * 1000;

export class CompanyAuthStore {
  private readonly dataDir: string;
  private readonly filePath: string;
  private cache: CompanyAuthFile | undefined;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, "company", "auth.json");
  }

  async listMembers(): Promise<MemberRecord[]> {
    return [...(await this.read()).members];
  }

  async findMemberByEmail(email: string): Promise<MemberRecord | undefined> {
    const normalized = normalizeEmail(email);
    return (await this.read()).members.find((m) => m.email === normalized);
  }

  async findMemberById(id: string): Promise<MemberRecord | undefined> {
    return (await this.read()).members.find((m) => m.id === id);
  }

  async createMember(input: {
    email: string;
    displayName?: string;
    roles: MemberRole[];
    /**
     * New invites default to pending (未激活) until first login.
     * Pass "active" only for already-verified bootstrap / migration.
     */
    status?: MemberStatus;
  }): Promise<MemberRecord> {
    const data = await this.read();
    const email = normalizeEmail(input.email);
    if (data.members.some((m) => m.email === email)) {
      throw new CompanyAuthError("conflict", "Member already exists");
    }
    const status: MemberStatus = input.status === "active" || input.status === "deactivated" ? input.status : "pending";
    const now = new Date().toISOString();
    const member: MemberRecord = {
      id: randomBytes(12).toString("hex"),
      email,
      displayName: input.displayName?.trim() || email.split("@")[0] || email,
      roles: input.roles,
      status,
      createdAt: now,
      ...(status === "active" ? { activatedAt: now } : {}),
    };
    data.members.push(member);
    await this.write(data);
    return member;
  }

  async updateMemberRoles(memberId: string, roles: MemberRole[]): Promise<MemberRecord> {
    if (!roles.length) {
      throw new CompanyAuthError("validation_error", "At least one role required");
    }
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    if (memberIsOrgAdmin(member) && !roles.includes("admin")) {
      const otherAdmins = data.members.filter(
        (m) => m.id !== memberId && memberStatus(m) === "active" && memberIsOrgAdmin(m),
      );
      if (otherAdmins.length === 0) {
        throw new CompanyAuthError("forbidden", "Cannot remove the last org-admin");
      }
    }
    member.roles = roles;
    await this.write(data);
    return member;
  }

  /** Update profile fields (displayName). Email is immutable. */
  async updateMemberProfile(memberId: string, input: { displayName?: string }): Promise<MemberRecord> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    if (input.displayName !== undefined) {
      const name = input.displayName.trim();
      if (!name) {
        throw new CompanyAuthError("validation_error", "displayName required");
      }
      if (name.length > 64) {
        throw new CompanyAuthError("validation_error", "displayName too long (max 64)");
      }
      member.displayName = name;
    }
    await this.write(data);
    return member;
  }

  /**
   * Deactivate member: cannot authenticate; sessions revoked by caller.
   */
  async deactivateMember(memberId: string): Promise<MemberRecord> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    if (memberIsOrgAdmin(member)) {
      const otherAdmins = data.members.filter(
        (m) => m.id !== memberId && memberStatus(m) === "active" && memberIsOrgAdmin(m),
      );
      if (otherAdmins.length === 0) {
        throw new CompanyAuthError("forbidden", "Cannot deactivate the last org-admin");
      }
    }
    member.status = "deactivated";
    member.deactivatedAt = new Date().toISOString();
    await this.write(data);
    return member;
  }

  async reactivateMember(memberId: string): Promise<MemberRecord> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    // Previously logged-in accounts return to active; never-logged stay pending.
    member.status = member.activatedAt ? "active" : "pending";
    delete member.deactivatedAt;
    await this.write(data);
    return member;
  }

  /**
   * Promote pending → active on first successful auth (session create).
   */
  async markActivated(memberId: string): Promise<MemberRecord | undefined> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) return undefined;
    if (member.status === "deactivated") return member;
    if (member.status === "pending" || !member.activatedAt) {
      member.status = "active";
      member.activatedAt = member.activatedAt || new Date().toISOString();
      await this.write(data);
    }
    return member;
  }

  /**
   * Hard-remove member record. Sessions must be revoked by caller.
   */
  async removeMember(memberId: string): Promise<void> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    if (memberIsOrgAdmin(member) && memberStatus(member) === "active") {
      const otherAdmins = data.members.filter(
        (m) => m.id !== memberId && memberStatus(m) === "active" && memberIsOrgAdmin(m),
      );
      if (otherAdmins.length === 0) {
        throw new CompanyAuthError("forbidden", "Cannot remove the last org-admin");
      }
    }
    data.members = data.members.filter((m) => m.id !== memberId);
    data.sessions = data.sessions.filter((s) => s.memberId !== memberId);
    await this.write(data);
  }

  async revokeAllSessionsForMember(memberId: string): Promise<number> {
    const data = await this.read();
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((s) => s.memberId !== memberId);
    const removed = before - data.sessions.length;
    if (removed > 0) {
      await this.write(data);
    }
    return removed;
  }

  async saveOtp(email: string, code: string): Promise<void> {
    const data = await this.read();
    const normalized = normalizeEmail(email);
    data.otps = data.otps.filter((o) => o.email !== normalized && !isExpired(o.expiresAt));
    data.otps.push({
      email: normalized,
      codeHash: hashSecret(code),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    await this.write(data);
  }

  async consumeOtp(email: string, code: string): Promise<boolean> {
    const data = await this.read();
    const normalized = normalizeEmail(email);
    const now = Date.now();
    const match = data.otps.find(
      (o) => o.email === normalized && !isExpired(o.expiresAt, now) && safeEqualHash(o.codeHash, hashSecret(code)),
    );
    if (!match) {
      return false;
    }
    data.otps = data.otps.filter((o) => o !== match);
    await this.write(data);
    return true;
  }

  async createSession(memberId: string): Promise<string> {
    const data = await this.read();
    const member = data.members.find((m) => m.id === memberId);
    if (!member) {
      throw new CompanyAuthError("not_found", "Member not found");
    }
    if (memberStatus(member) === "deactivated") {
      throw new CompanyAuthError("forbidden", "Member account is deactivated");
    }
    // First login activates pending accounts.
    if (member.status === "pending" || !member.activatedAt) {
      member.status = "active";
      member.activatedAt = member.activatedAt || new Date().toISOString();
    }
    const token = `omc_${randomBytes(24).toString("base64url")}`;
    data.sessions = data.sessions.filter((s) => !isExpired(s.expiresAt));
    data.sessions.push({
      tokenHash: hashSecret(token),
      memberId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    await this.write(data);
    return token;
  }

  async resolveSession(token: string | undefined): Promise<MemberRecord | undefined> {
    if (!token?.trim()) {
      return undefined;
    }
    const data = await this.read();
    const hash = hashSecret(token.trim());
    const session = data.sessions.find((s) => !isExpired(s.expiresAt) && safeEqualHash(s.tokenHash, hash));
    if (!session) {
      return undefined;
    }
    const member = data.members.find((m) => m.id === session.memberId);
    // Only fully active accounts may use an existing session (pending never has sessions).
    if (!member || memberStatus(member) !== "active") {
      return undefined;
    }
    return member;
  }

  async revokeSession(token: string | undefined): Promise<void> {
    if (!token?.trim()) {
      return;
    }
    const data = await this.read();
    const hash = hashSecret(token.trim());
    data.sessions = data.sessions.filter((s) => !safeEqualHash(s.tokenHash, hash));
    await this.write(data);
  }

  private async read(): Promise<CompanyAuthFile> {
    if (this.cache) {
      return structuredClone(this.cache);
    }
    try {
      await access(this.filePath);
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as CompanyAuthFile;
      this.cache = {
        members: (raw.members ?? []).map(normalizeMemberRecord),
        sessions: raw.sessions ?? [],
        otps: raw.otps ?? [],
      };
    } catch {
      this.cache = { members: [], sessions: [], otps: [] };
    }
    return structuredClone(this.cache);
  }

  private async write(data: CompanyAuthFile): Promise<void> {
    await mkdir(join(this.dataDir, "company"), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    this.cache = structuredClone(data);
  }
}

export class CompanyAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function memberIsOrgAdmin(member: MemberRecord): boolean {
  return member.roles.includes("admin");
}

export function memberStatus(member: Pick<MemberRecord, "status"> | { status?: MemberStatus }): MemberStatus {
  if (member.status === "deactivated") return "deactivated";
  if (member.status === "pending") return "pending";
  return "active";
}

/** pending + active may complete OTP login; deactivated cannot. */
export function memberCanLogin(member: Pick<MemberRecord, "status"> | { status?: MemberStatus }): boolean {
  const s = memberStatus(member);
  return s === "active" || s === "pending";
}

/** English display label for account lifecycle (API `statusLabel`). Locales map separately in the web app. */
export function accountStatusLabel(status: MemberStatus): string {
  if (status === "pending") return "Pending";
  if (status === "deactivated") return "Deactivated";
  return "Active";
}

/** @deprecated use accountStatusLabel */
export const accountStatusLabelZh: (status: MemberStatus) => string = accountStatusLabel;

function normalizeMemberRecord(
  raw: MemberRecord | (Omit<MemberRecord, "status"> & { status?: MemberStatus }),
): MemberRecord {
  let status: MemberStatus = "active";
  if (raw.status === "deactivated") status = "deactivated";
  else if (raw.status === "pending") status = "pending";
  return {
    ...raw,
    status,
    roles: Array.isArray(raw.roles) ? raw.roles : ["member"],
  };
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isExpired(iso: string, now = Date.now()): boolean {
  return Date.parse(iso) <= now;
}
