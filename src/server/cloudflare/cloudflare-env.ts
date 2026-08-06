import type { AssetsBinding, D1DatabaseBinding, KVNamespaceBinding, R2BucketBinding } from "./cloudflare-bindings.ts";
import { type OmcEnvSuffix, readOmcEnvFrom, readPositiveIntegerFrom } from "../env.ts";

export interface CloudflareEnv {
  DB: D1DatabaseBinding;
  TRANSIT_FILES: R2BucketBinding | KVNamespaceBinding;
  TRANSIT_FILES_BACKEND?: "r2" | "kv";
  ASSETS?: AssetsBinding;
  OMC_ORIGIN?: string;
  OMC_ADMIN_TOKEN?: string;
  OMC_RUNTIME_TOKEN?: string;
  OMC_ENCRYPTION_KEY?: string;
  OMC_ALLOWED_ACTIONS?: string;
  OMC_BLOCKED_ACTIONS?: string;
  OMC_ALLOWED_PROXIES?: string;
  OMC_BLOCKED_PROXIES?: string;
  OMC_ALLOW_PRIVATE_NETWORK?: string;
  OMC_TRANSIT_FILE_TTL_SECONDS?: string;
  OMC_TRANSIT_FILE_MAX_BYTES?: string;
  OMC_RUN_LIMIT?: string;
  // Deprecated OOMOL_CONNECT_* aliases accepted via readOmcEnvFrom
}

export function resolvePublicOrigin(request: Request, env: CloudflareEnv): string {
  return (readOmcEnvFrom(env, "ORIGIN") ?? new URL(request.url).origin).replace(/\/+$/, "");
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function cloudflareOmc(env: CloudflareEnv, suffix: OmcEnvSuffix): string | undefined {
  return readOmcEnvFrom(env, suffix);
}

export function cloudflareOmcInt(env: CloudflareEnv, suffix: OmcEnvSuffix, fallback: number): number {
  return readPositiveIntegerFrom(env, suffix, fallback);
}
