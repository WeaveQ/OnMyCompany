/**
 * OnMyCompany environment variable resolution.
 *
 * Canonical prefix: `OMC_*`
 * Deprecated aliases (`OOMOL_CONNECT_*`) still accepted as fallback until removed.
 *
 * SoT for names: docs/onmycompany/ENV.md
 */

export interface EnvKeyPair {
  /** Canonical OnMyCompany name */
  omc: string;
  /** Deprecated alias */
  legacy: string;
}

/** Suffix after OMC_ / deprecated alias is identical for all mapped keys. */
const SUFFIXES = [
  "ORIGIN",
  "DATA_DIR",
  "ENCRYPTION_KEY",
  "NEW_ENCRYPTION_KEY",
  "ADMIN_TOKEN",
  "RUNTIME_TOKEN",
  "JWKS_URI",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "ALLOWED_ACTIONS",
  "BLOCKED_ACTIONS",
  "ALLOWED_PROXIES",
  "BLOCKED_PROXIES",
  "ALLOW_PRIVATE_NETWORK",
  "LOG_LEVEL",
  "TRANSIT_FILE_TTL_SECONDS",
  "TRANSIT_FILE_MAX_BYTES",
  "RUN_LIMIT",
  /** office | full — see src/core/office-catalog.ts */
  "CATALOG_PROFILE",
  /** Comma-separated service ids, or * for full catalog (overrides profile) */
  "ALLOWED_SERVICES",
] as const;

export type OmcEnvSuffix = (typeof SUFFIXES)[number];

const LEGACY_PREFIX = "OOMOL" + "_CONNECT_";

export const OMC_ENV: Record<OmcEnvSuffix, EnvKeyPair> = Object.fromEntries(
  SUFFIXES.map((suffix) => [suffix, { omc: `OMC_${suffix}`, legacy: `${LEGACY_PREFIX}${suffix}` }]),
) as Record<OmcEnvSuffix, EnvKeyPair>;

/** Enterprise-only keys (no deprecated alias). */
export const OMC_PRODUCT_ENV = {
  BOOTSTRAP_ADMIN_EMAIL: "OMC_BOOTSTRAP_ADMIN_EMAIL",
} as const;

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

/**
 * Read process.env: OMC_* first, then deprecated alias.
 */
export function readOmcEnv(suffix: OmcEnvSuffix): string | undefined {
  const pair = OMC_ENV[suffix];
  return firstNonEmpty(process.env[pair.omc], process.env[pair.legacy]);
}

/**
 * Read from a bindings/env record (e.g. Cloudflare Workers).
 */
export function readOmcEnvFrom(
  env: Record<string, string | undefined> | object,
  suffix: OmcEnvSuffix,
): string | undefined {
  const pair = OMC_ENV[suffix];
  const record = env as Record<string, string | undefined>;
  return firstNonEmpty(record[pair.omc], record[pair.legacy]);
}

/** Canonical name for logs / error messages (always OMC_*). */
export function omcEnvName(suffix: OmcEnvSuffix): string {
  return OMC_ENV[suffix].omc;
}

export function readPositiveIntegerOmcEnv(suffix: OmcEnvSuffix, fallback: number): number {
  const raw = readOmcEnv(suffix);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPositiveIntegerFrom(
  env: Record<string, string | undefined> | object,
  suffix: OmcEnvSuffix,
  fallback: number,
): number {
  const raw = readOmcEnvFrom(env, suffix);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
