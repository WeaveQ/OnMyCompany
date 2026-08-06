/**
 * G1a: Connection candidate ordering, retriable error detection, cooldown.
 */

export interface ConnectionCandidate {
  connectionName: string;
}

const cooldownUntil = new Map<string, number>();

export function connectionCooldownKey(service: string, connectionName: string): string {
  return `${service}::${connectionName}`;
}

export function markConnectionCooldown(service: string, connectionName: string, cooldownSec: number): void {
  const ms = Math.max(0, cooldownSec) * 1000;
  if (ms <= 0) return;
  cooldownUntil.set(connectionCooldownKey(service, connectionName), Date.now() + ms);
}

export function isConnectionCoolingDown(service: string, connectionName: string, now: number = Date.now()): boolean {
  const until = cooldownUntil.get(connectionCooldownKey(service, connectionName));
  if (until === undefined) return false;
  if (until <= now) {
    cooldownUntil.delete(connectionCooldownKey(service, connectionName));
    return false;
  }
  return true;
}

/** Test helper. */
export function clearConnectionCooldownsForTests(): void {
  cooldownUntil.clear();
}

/**
 * Order candidates: preferred name first (if any), then "default", then alpha.
 * Cool-down connections are sorted after active ones (still attempted if all cool).
 */
export function orderConnectionCandidates(
  service: string,
  names: string[],
  preferredName?: string,
  now: number = Date.now(),
): ConnectionCandidate[] {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (preferredName?.trim()) {
    return [{ connectionName: preferredName.trim() }];
  }

  const scored = unique.map((connectionName) => {
    let score = 100;
    if (connectionName === "default") score -= 50;
    if (isConnectionCoolingDown(service, connectionName, now)) score += 1000;
    return { connectionName, score };
  });
  scored.sort((a, b) => a.score - b.score || a.connectionName.localeCompare(b.connectionName));
  return scored.map(({ connectionName }) => ({ connectionName }));
}

/**
 * Whether an action/connection failure should try the next connection.
 * Explicit single-connection pin still uses this only when multiple candidates exist.
 */
export function isRetriableExecutionError(error: { code?: string; message?: string } | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  const blob = `${code} ${message}`;

  if (
    code === "connection_not_found" ||
    code === "connection_disabled" ||
    code === "invalid_input" ||
    code === "action_blocked" ||
    code === "action_not_allowed" ||
    code === "validation_error"
  ) {
    return false;
  }

  if (/\b429\b/.test(blob) || blob.includes("rate_limit") || blob.includes("rate limit") || blob.includes("too many")) {
    return true;
  }
  if (/\b401\b/.test(blob) || /\b403\b/.test(blob) || blob.includes("unauthorized") || blob.includes("forbidden")) {
    return true;
  }
  if (/\b5\d\d\b/.test(blob) || blob.includes("bad_gateway") || blob.includes("service_unavailable")) {
    return true;
  }
  if (
    blob.includes("timeout") ||
    blob.includes("timed out") ||
    blob.includes("econnreset") ||
    blob.includes("econnrefused") ||
    blob.includes("network") ||
    blob.includes("socket")
  ) {
    return true;
  }
  if (code.includes("oauth") && (blob.includes("refresh") || blob.includes("expired"))) {
    return true;
  }
  return false;
}

export interface FallbackPolicy {
  maxAttempts: number;
  totalBudgetMs: number;
  cooldownSec: number;
}

export const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  maxAttempts: 3,
  totalBudgetMs: 30_000,
  cooldownSec: 60,
};
