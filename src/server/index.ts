import { serve } from "@hono/node-server";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { resolveAllowedCatalogServices } from "../core/office-catalog.ts";
import { parsePrivateNetworkAccessFlag, setPrivateNetworkAccessAllowed } from "../core/request.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { executorModules } from "../providers/registry.generated.ts";
import { createRuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import { registerStaticRoutes } from "./api/static-routes.ts";
import { createConnectApp } from "./connect-app.ts";
import { omcEnvName, readOmcEnv, readPositiveIntegerOmcEnv } from "./env.ts";
import { TransitFileService } from "./files/transit-files.ts";
import { logger } from "./logger.ts";
import { createSecretCodec } from "./secrets/secret-codec.ts";
import { DEFAULT_RUN_LIMIT } from "./storage/runtime-store.ts";
import { SqliteRuntimeDatabase } from "./storage/sqlite-runtime-store.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const publicOrigin = readOmcEnv("ORIGIN") ?? `http://localhost:${port}`;
const dataDir = readOmcEnv("DATA_DIR") ?? join(process.cwd(), "data");
const transitFileTtlSeconds = readPositiveIntegerOmcEnv("TRANSIT_FILE_TTL_SECONDS", 86_400);
const transitFileMaxBytes = readPositiveIntegerOmcEnv("TRANSIT_FILE_MAX_BYTES", 100 * 1024 * 1024);
const runLimit = readPositiveIntegerOmcEnv("RUN_LIMIT", DEFAULT_RUN_LIMIT);
const secretCodec = createSecretCodec(readOmcEnv("ENCRYPTION_KEY"));
const adminToken = readOmcEnv("ADMIN_TOKEN");
const runtimeToken = readOmcEnv("RUNTIME_TOKEN");
const verifyRuntimeJwt = createRuntimeJwtVerifier({
  jwksUri: readOmcEnv("JWKS_URI"),
  issuer: readOmcEnv("JWT_ISSUER"),
  audience: readOmcEnv("JWT_AUDIENCE"),
});
const actionPolicy = new ActionPolicyService({
  allowedActions: parseActionPolicyList(readOmcEnv("ALLOWED_ACTIONS")),
  blockedActions: parseActionPolicyList(readOmcEnv("BLOCKED_ACTIONS")),
  allowedProxies: parseActionPolicyList(readOmcEnv("ALLOWED_PROXIES")),
  blockedProxies: parseActionPolicyList(readOmcEnv("BLOCKED_PROXIES")),
});
setPrivateNetworkAccessAllowed(parsePrivateNetworkAccessFlag(readOmcEnv("ALLOW_PRIVATE_NETWORK")));
const builtRoot = join(process.cwd(), "dist/web");
const staticRoot = await resolveStaticRoot(builtRoot);
await mkdir(dataDir, { recursive: true });
const allowedCatalogServices = resolveAllowedCatalogServices({
  profile: readOmcEnv("CATALOG_PROFILE") ?? process.env.OMC_CATALOG_PROFILE,
  allowedServicesEnv: readOmcEnv("ALLOWED_SERVICES") ?? process.env.OMC_ALLOWED_SERVICES,
});
const catalog = await loadCatalog(undefined, {
  executableServices: Object.keys(executorModules),
  allowedServices: allowedCatalogServices,
});
if (allowedCatalogServices) {
  logger.info(
    {
      catalogProfile: readOmcEnv("CATALOG_PROFILE") ?? process.env.OMC_CATALOG_PROFILE ?? "office",
      providerCount: catalog.providers.length,
    },
    "catalog filtered to office/productivity allowlist",
  );
}
const providerLoader = new ProviderLoader(executorModules);
const runtimeDatabase = new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite"), {
  logger,
  secretCodec,
  runLimit,
});
const transitFiles = new TransitFileService({
  rootDir: join(dataDir, "files"),
  publicOrigin,
  ttlSeconds: transitFileTtlSeconds,
  maxBytes: transitFileMaxBytes,
});
await transitFiles.cleanupExpired();
const { app, runtimeAuthConfigured } = await createConnectApp({
  catalog,
  providerLoader,
  runtimeDatabase,
  transitFiles,
  publicOrigin,
  secretCodec,
  adminToken,
  runtimeToken,
  verifyRuntimeJwt,
  actionPolicy,
  registerStaticRoutes: (app) => registerStaticRoutes(app, staticRoot),
  company: {
    dataDir,
    productVersion: "0.1.0-m0",
    bootstrapAdminEmail: process.env.OMC_BOOTSTRAP_ADMIN_EMAIL,
    devOtp: process.env.OMC_DEV_OTP,
  },
  logger,
});

process.once("SIGINT", () => {
  runtimeDatabase.close();
  process.exit(0);
});
process.once("SIGTERM", () => {
  runtimeDatabase.close();
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    logger.info({ url: `http://${hostname}:${info.port}` }, "connect server listening");
    logger.info({ dataDir }, "runtime data directory");
    if (!adminToken) {
      logger.warn(`local admin authentication is disabled; set ${omcEnvName("ADMIN_TOKEN")} to require bearer tokens`);
    }
    if (!runtimeAuthConfigured) {
      logger.warn(
        `runtime API authentication is disabled; create a runtime token in the web console, set ${omcEnvName("RUNTIME_TOKEN")}, or configure JWT authentication`,
      );
    }
    if (!secretCodec.encrypted) {
      logger.warn(
        `local data encryption is disabled; set ${omcEnvName("ENCRYPTION_KEY")} to encrypt stored credentials, OAuth client configuration, and completed idempotent action responses`,
      );
    }
    if (!staticRoot) {
      logger.warn("web console assets are not built; use http://localhost:5180 for local console development");
    }
  },
);

async function resolveStaticRoot(root: string): Promise<string | undefined> {
  try {
    await access(join(root, "index.html"));
    return root;
  } catch {
    return undefined;
  }
}
