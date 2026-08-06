/**
 * Shared member session helpers for management console pages.
 * Avoids copy-paste of sessionStorage token + authHeaders across pages.
 */

import { apiGet, apiPost } from "./api";

export const MEMBER_TOKEN_KEY = "omc_member_token";
export const ACTIVE_TEAM_KEY = "omc_active_team_id";

/** Local-dev bootstrap (matches server OMC_BOOTSTRAP_ADMIN_EMAIL / OMC_DEV_OTP defaults). */
export const DEV_MEMBER_EMAIL = "admin@company.internal";
export const DEV_MEMBER_OTP = "000000";

let bootstrapInFlight: Promise<boolean> | null = null;

/** In-memory fallback when sessionStorage is unavailable (Node unit tests). */
const memory = new Map<string, string>();

function storageGet(key: string): string | undefined {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(key) || undefined;
    }
  } catch {
    // ignore
  }
  return memory.get(key);
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    // fall through
  }
  memory.set(key, value);
}

function storageRemove(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  memory.delete(key);
}

export function getMemberToken(): string | undefined {
  return storageGet(MEMBER_TOKEN_KEY);
}

export function setMemberToken(token: string): void {
  storageSet(MEMBER_TOKEN_KEY, token);
}

export function clearMemberToken(): void {
  storageRemove(MEMBER_TOKEN_KEY);
}

export function memberAuthHeaders(): { bearerToken?: string } {
  const token = getMemberToken();
  return token ? { bearerToken: token } : {};
}

export function hasMemberSession(): boolean {
  return Boolean(getMemberToken());
}

export function getActiveTeamId(): string | undefined {
  return storageGet(ACTIVE_TEAM_KEY);
}

/**
 * Persist active team (or ALL_TEAMS_ID for 全公司) and notify open pages.
 * Pass empty string to clear.
 */
export function setActiveTeamId(teamId: string): void {
  if (!teamId) {
    storageRemove(ACTIVE_TEAM_KEY);
  } else {
    storageSet(ACTIVE_TEAM_KEY, teamId);
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("omc-active-team-changed", { detail: { teamId: teamId || undefined } }),
      );
    }
  } catch {
    // ignore (SSR / tests)
  }
}

export const ACTIVE_TEAM_CHANGED_EVENT = "omc-active-team-changed";

/** Subscribe to sidebar/team-switcher changes. Returns unsubscribe. */
export function subscribeActiveTeamId(onChange: (teamId: string | undefined) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<{ teamId?: string }>).detail;
    onChange(detail?.teamId ?? getActiveTeamId());
  };
  window.addEventListener(ACTIVE_TEAM_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ACTIVE_TEAM_CHANGED_EVENT, handler);
}

/** teamId query for usage/runs — omit when 全公司 or unset. */
export function activeTeamQueryParam(): string | undefined {
  const id = getActiveTeamId();
  if (!id || id === "__all__") return undefined;
  return id;
}

/**
 * If the management console is already unlocked but there is no member JWT,
 * silently mint a bootstrap org-admin session (local open console / dev OTP).
 * Prevents a second login wall on 企业账号 / 团队 / 企业设置.
 *
 * Safe no-op when already authed, or when email OTP is disabled in production.
 */
export async function ensureMemberSessionForConsole(): Promise<boolean> {
  if (hasMemberSession()) return true;
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    try {
      // Prefer cookie session if server already set omc_member_session via prior login
      try {
        const me = await apiGet<{ authenticated?: boolean }>("/api/me", memberAuthHeaders());
        if (me.authenticated) return true;
      } catch {
        // fall through to OTP bootstrap
      }

      // Only auto-bootstrap when console considers us "in" (open local or admin cookie).
      try {
        const shell = await apiGet<{ authenticated?: boolean; adminAuthConfigured?: boolean }>(
          "/api/auth/session",
        );
        if (shell.authenticated === false) return false;
      } catch {
        // session endpoint unavailable — still try dev OTP once
      }

      await apiPost("/api/company/auth/email/start", { email: DEV_MEMBER_EMAIL });
      const verified = await apiPost<{ token?: string }>("/api/company/auth/email/verify", {
        email: DEV_MEMBER_EMAIL,
        code: DEV_MEMBER_OTP,
      });
      if (!verified.token) return false;
      setMemberToken(verified.token);
      return true;
    } catch {
      return false;
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}
