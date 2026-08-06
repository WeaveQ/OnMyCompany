import type { MemberRecord } from "./auth/store.ts";
import type { Context } from "hono";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  CompanyAuthError,
  CompanyAuthStore,
  accountStatusLabelZh,
  memberIsOrgAdmin,
  memberStatus,
} from "./auth/store.ts";
import { OrgConfigError } from "./org-config/store.ts";
import { SkillsError } from "./skills/store.ts";
import { ZipError } from "./skills/zip.ts";
import { TeamsError } from "./teams/store.ts";

export const MEMBER_COOKIE: string = "omc_member_session";
export const COOKIE_MAX_AGE: number = 7 * 24 * 60 * 60;

export async function requireMember(context: Context, authStore: CompanyAuthStore): Promise<MemberRecord> {
  const member = await authStore.resolveSession(readMemberToken(context));
  if (!member) {
    throw new CompanyAuthError("unauthenticated", "Member session required");
  }
  return member;
}

/**
 * Read-only audit access: org-admin / auditor member, OR local console ops-admin.
 * Avoids a second OTP when the operator already unlocked the management console.
 */
export async function requireAuditReader(
  context: Context,
  authStore: CompanyAuthStore,
  isOpsAdmin?: (context: Context) => Promise<boolean>,
): Promise<{ via: "member" | "ops-admin"; member?: MemberRecord }> {
  const token = readMemberToken(context);
  if (token) {
    const member = await authStore.resolveSession(token);
    if (member) {
      if (memberIsOrgAdmin(member) || member.roles.includes("auditor")) {
        return { via: "member", member };
      }
      // Member without audit role: allow if console ops-admin is also present.
      if (isOpsAdmin && (await isOpsAdmin(context))) {
        return { via: "ops-admin", member };
      }
      throw new CompanyAuthError("forbidden", "admin or auditor role required");
    }
  }

  if (isOpsAdmin && (await isOpsAdmin(context))) {
    return { via: "ops-admin" };
  }

  throw new CompanyAuthError("unauthenticated", "Member session or console admin required");
}

export function readMemberToken(context: Context): string | undefined {
  const header = context.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return getCookie(context, MEMBER_COOKIE) || undefined;
}

export function setMemberCookie(context: Context, token: string): void {
  setCookie(context, MEMBER_COOKIE, token, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    sameSite: "Lax",
    secure: context.req.url.startsWith("https://"),
    path: "/",
  });
}

export function clearMemberCookie(context: Context): void {
  deleteCookie(context, MEMBER_COOKIE, {
    httpOnly: true,
    sameSite: "Lax",
    secure: context.req.url.startsWith("https://"),
    path: "/",
  });
}

export type PublicMemberView = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status: string;
  statusLabel: string;
  activatedAt?: string;
  deactivatedAt?: string;
};

export function publicMember(member: MemberRecord): PublicMemberView {
  const status = memberStatus(member);
  const view: PublicMemberView = {
    id: member.id,
    email: member.email,
    displayName: member.displayName,
    roles: [...member.roles],
    status,
    statusLabel: accountStatusLabelZh(status),
  };
  if (member.activatedAt) view.activatedAt = member.activatedAt;
  if (member.deactivatedAt) view.deactivatedAt = member.deactivatedAt;
  return view;
}

export async function readJsonBody(context: Context): Promise<Record<string, unknown>> {
  try {
    const value = await context.req.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function jsonError(context: Context, status: number, code: string, message: string): Response {
  return context.json({ error: { code, message } }, status as 400);
}

export function mapError(context: Context, error: unknown): Response {
  if (error instanceof CompanyAuthError) {
    const status =
      error.code === "unauthenticated"
        ? 401
        : error.code === "conflict"
          ? 409
          : error.code === "not_found"
            ? 404
            : error.code === "validation_error"
              ? 400
              : 403;
    return jsonError(context, status, error.code, error.message);
  }
  if (
    error instanceof OrgConfigError ||
    error instanceof SkillsError ||
    error instanceof ZipError ||
    error instanceof TeamsError
  ) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "forbidden"
          ? 403
          : error.code === "conflict"
            ? 409
            : error.code === "validation_error"
              ? 400
              : 400;
    return jsonError(context, status, error.code, error.message);
  }
  console.error(error);
  return jsonError(context, 500, "internal_error", "Unexpected company error");
}
