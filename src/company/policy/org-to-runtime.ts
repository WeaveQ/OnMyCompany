import type { PolicyRules } from "../../core/action-policy.ts";
import { emptyPolicyRules } from "../../core/action-policy.ts";

/**
 * Map OrgConfig `policy.json` body → Gateway runtime policy rules (M3a single-write).
 * Accepts either nested `actions` / `proxies` or flat allow/block lists.
 */
export function orgPolicyToRuntimeRules(policy: Record<string, unknown>): PolicyRules {
  const base = emptyPolicyRules();
  const actions = asRecord(policy.actions);
  const proxies = asRecord(policy.proxies);

  return {
    allowedActions: stringList(
      policy.allowedActions ?? actions?.allowed ?? policy.allowed_actions,
      base.allowedActions,
    ),
    blockedActions: stringList(
      policy.blockedActions ?? actions?.blocked ?? policy.blocked_actions,
      base.blockedActions,
    ),
    allowedProxies: stringList(
      policy.allowedProxies ?? proxies?.allowed ?? policy.allowed_proxies,
      base.allowedProxies,
    ),
    blockedProxies: stringList(
      policy.blockedProxies ?? proxies?.blocked ?? policy.blocked_proxies,
      base.blockedProxies,
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
