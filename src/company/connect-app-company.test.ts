import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConnectApp } from "../server/connect-app.ts";
import type { CatalogStore } from "../catalog-store.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { ITransitFileService } from "../server/files/transit-file-store.ts";
import type { RuntimeDatabase } from "../server/storage/runtime-database.ts";
import type { ISecretCodec } from "../server/secrets/secret-codec-core.ts";
import type { CompanyHealthBody } from "./routes.ts";

/**
 * Integration: company routes mounted through the real createConnectApp entry.
 * Uses minimal stubs for Gateway deps so the test exercises the product mount path only.
 */

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createConnectApp company mount", () => {
  it("exposes GET /api/company/health on the same app as /health", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-app-"));
    tempRoots.push(dataDir);

    const { app } = await createConnectApp({
      catalog: emptyCatalog(),
      providerLoader: emptyProviderLoader(),
      runtimeDatabase: emptyRuntimeDatabase(),
      transitFiles: emptyTransitFiles(),
      publicOrigin: "http://localhost:3000",
      secretCodec: plainSecretCodec(),
      company: { dataDir, productVersion: "0.1.0-m0" },
      computeRuntimeAuthConfigured: false,
      compressApiResponses: false,
    });

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const company = await app.request("/api/company/health");
    expect(company.status).toBe(200);
    const body = (await company.json()) as CompanyHealthBody;
    expect(body.ok).toBe(true);
    expect(body.companyModule).toBe(true);
    expect(body.orgConfigReady).toBe(true);
    expect(body.orgConfigRoot).toContain(join("org", "default", "config"));
  });
});

function emptyCatalog(): CatalogStore {
  return {
    providers: [],
    actions: [],
    providerSummariesJson: "[]",
    providerSummariesEtag: '"empty"',
    getProvider() {
      return undefined;
    },
    getAction() {
      return undefined;
    },
  } as unknown as CatalogStore;
}

function emptyProviderLoader(): IProviderLoader {
  return {
    async loadActionExecutor() {
      throw new Error("not used");
    },
    async loadProxyExecutor() {
      return undefined;
    },
    async loadCredentialValidators() {
      return {};
    },
  } as unknown as IProviderLoader;
}

function emptyRuntimeDatabase(): RuntimeDatabase {
  const noop = {
    async get() {
      return undefined;
    },
    async set() {
      return undefined;
    },
    async delete() {},
    async list() {
      return [];
    },
    async add() {},
    async take() {
      return undefined;
    },
    async put() {},
    async update() {
      return true;
    },
  };
  return {
    connectionStore: {
      ...noop,
      async set() {
        return {
          id: "x",
          revision: "r",
          service: "s",
          connectionName: "default",
          credential: { authType: "api_key", values: {} },
        };
      },
      async updateCredential() {
        return true;
      },
    },
    oauthClientConfigStore: noop,
    oauthStateStore: noop,
    runtimeTokenStore: {
      async add() {},
      async list() {
        return [];
      },
      async getByTokenHash() {
        return undefined;
      },
      async update() {
        return true;
      },
      async delete() {
        return true;
      },
    },
    runtimePolicyStore: {
      async get() {
        return undefined;
      },
      async set() {},
    },
    runLogStore: {
      async append() {},
      async list() {
        return { items: [], nextCursor: undefined };
      },
      async get() {
        return undefined;
      },
    },
    idempotencyStore: {
      async get() {
        return undefined;
      },
      async put() {},
    },
    close() {},
  } as unknown as RuntimeDatabase;
}

function emptyTransitFiles(): ITransitFileService {
  return {
    async create() {
      throw new Error("not used");
    },
    async get() {
      return undefined;
    },
    async delete() {},
    async cleanupExpired() {},
  } as unknown as ITransitFileService;
}

function plainSecretCodec(): ISecretCodec {
  return {
    encrypted: false,
    encode(value: unknown) {
      return JSON.stringify(value);
    },
    decode(value: string) {
      return JSON.parse(value);
    },
  };
}
