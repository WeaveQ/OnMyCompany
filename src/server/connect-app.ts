import type { CatalogStore } from "../catalog-store.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { RuntimeJwtVerifier } from "./api/runtime-jwt.ts";
import type { ITransitFileService } from "./files/transit-file-store.ts";
import type { Logger } from "./logger.ts";
import type { ISecretCodec } from "./secrets/secret-codec-core.ts";
import type { RuntimeDatabase } from "./storage/runtime-database.ts";
import type { Hono } from "hono";

import { TokenMemberBindingStore } from "../company/auth/token-bindings.ts";
import { orgPolicyToRuntimeRules } from "../company/policy/org-to-runtime.ts";
import { registerCompanyRoutes } from "../company/routes.ts";
import { isLocalAdminAuthenticated } from "./api/auth.ts";
import { ConnectionService } from "../connection-service.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "../oauth/oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ActionRunner } from "./actions/action-runner.ts";
import { ConnectServer } from "./connect-server.ts";
import { RuntimeTokenService } from "./storage/runtime-token-service.ts";

export interface CompanyMountOptions {
  dataDir: string;
  orgId?: string;
  orgConfigRoot?: string;
  productVersion?: string;
  bootstrapAdminEmail?: string;
  devOtp?: string;
  onOrgPolicyWrite?: (policy: Record<string, unknown>) => Promise<void> | void;
}

export interface ConnectAppOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  runtimeDatabase: RuntimeDatabase;
  transitFiles: ITransitFileService;
  publicOrigin: string;
  secretCodec: ISecretCodec;
  adminToken?: string;
  runtimeToken?: string;
  verifyRuntimeJwt?: RuntimeJwtVerifier;
  actionPolicy?: ActionPolicyService;
  registerStaticRoutes?: (app: Hono) => void;
  /** When set, mounts `/api/company/*` on the same Hono app. */
  company?: CompanyMountOptions;
  logger?: Logger;
  computeRuntimeAuthConfigured?: boolean;
  compressApiResponses?: boolean;
}

export interface ConnectApp {
  app: Hono;
  runtimeAuthConfigured: boolean;
}

export async function createConnectApp(options: ConnectAppOptions): Promise<ConnectApp> {
  const runtimeTokens = new RuntimeTokenService(options.runtimeDatabase.runtimeTokenStore, options.logger);
  const hasStoredRuntimeTokens = async (): Promise<boolean> => (await runtimeTokens.listTokens()).length > 0;
  const oauthClientConfigs = new OAuthClientConfigService({
    catalog: options.catalog,
    origin: options.publicOrigin,
    store: options.runtimeDatabase.oauthClientConfigStore,
  });
  const connections = new ConnectionService({
    catalog: options.catalog,
    oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
    providerLoader: options.providerLoader,
    store: options.runtimeDatabase.connectionStore,
    logger: options.logger,
  });
  const actions = new ActionRunner({
    catalog: options.catalog,
    providerLoader: options.providerLoader,
    connections,
    runs: options.runtimeDatabase.runLogStore,
    transitFiles: options.transitFiles,
    actionPolicy: options.actionPolicy,
    logger: options.logger,
  });

  const tokenBindings = options.company ? new TokenMemberBindingStore(options.company.dataDir) : undefined;

  const app = new ConnectServer({
    catalog: options.catalog,
    providerLoader: options.providerLoader,
    connections,
    oauthClientConfigs,
    oauthFlow: new OAuthFlowService({
      clientConfigs: oauthClientConfigs,
      connections,
      states: options.runtimeDatabase.oauthStateStore,
    }),
    actions,
    idempotency: options.runtimeDatabase.idempotencyStore,
    transitFiles: options.transitFiles,
    runtimeTokens,
    runtimePolicyStore: options.runtimeDatabase.runtimePolicyStore,
    registerStaticRoutes: options.registerStaticRoutes,
    auth: {
      adminToken: options.adminToken,
      runtimeToken: options.runtimeToken,
      hasRuntimeTokens: hasStoredRuntimeTokens,
      resolveRuntimeToken: async (token) => {
        const grant = await runtimeTokens.resolveToken(token);
        if (!grant || !tokenBindings) return grant;
        const memberId = await tokenBindings.resolveMemberId(grant.tokenId);
        return memberId ? { ...grant, memberId } : grant;
      },
      verifyRuntimeJwt: options.verifyRuntimeJwt,
    },
    actionPolicy: options.actionPolicy,
    logger: options.logger,
    compressApiResponses: options.compressApiResponses,
    // P7: company product mount → OrgConfig is sole policy write path
    companyPolicyWriteOnly: Boolean(options.company),
  }).createApp();

  if (options.company) {
    const company = options.company;
    registerCompanyRoutes(app, {
      ...company,
      // Single shared binding store (connect-app + routes) — no dual cache (P5).
      tokenBindings,
      // Console unlock (ops-admin) may read audit without a second member OTP.
      isOpsAdmin: (context) => isLocalAdminAuthenticated(context, options.adminToken),
      onOrgPolicyWrite: async (policy) => {
        // M3a: Org policy write is source of truth → mirror into runtime-policy store
        const rules = orgPolicyToRuntimeRules(policy);
        await options.runtimeDatabase.runtimePolicyStore.set({
          rules,
          updatedAt: new Date().toISOString(),
        });
        if (company.onOrgPolicyWrite) {
          await company.onOrgPolicyWrite(policy);
        }
      },
      createMemberRuntimeToken: async ({ name, memberId }) => {
        const created = await runtimeTokens.createToken(name);
        await tokenBindings?.bind(created.record.id, memberId);
        return { token: created.token, tokenId: created.record.id };
      },
      revokeMemberRuntimeTokens: async (memberId) => {
        if (!tokenBindings) return 0;
        const ids = await tokenBindings.listTokenIdsForMember(memberId);
        let n = 0;
        for (const id of ids) {
          if (await runtimeTokens.revokeToken(id)) n += 1;
        }
        await tokenBindings.unbindAllForMember(memberId);
        return n;
      },
      listRuns: async (limit = 5000) => {
        const page = await options.runtimeDatabase.runLogStore.list({ limit });
        return page.items;
      },
    });
  }

  return {
    app,
    runtimeAuthConfigured:
      Boolean(options.runtimeToken) ||
      Boolean(options.verifyRuntimeJwt) ||
      (options.computeRuntimeAuthConfigured === false ? false : await hasStoredRuntimeTokens()),
  };
}
