import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage } from "../storage/runtime-store.ts";
import type { ActionRunnerOptions } from "./action-runner.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { ActionPolicyService } from "../../core/action-policy.ts";
import { ActionRunner } from "./action-runner.ts";
import * as runLogSummary from "./run-log-summary.ts";

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

const exampleProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [echoAction],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActionRunner", () => {
  it("uses one execution id across logs, storage, and the result", async () => {
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({
      actionId: "example.echo",
      input: { message: "hello", token: "secret" },
      caller: "http",
    });

    expect(run).toMatchObject({ auditPersisted: true, result: { ok: true } });
    expect(runs.items).toEqual([
      expect.objectContaining({
        id: run?.executionId,
        connectionId: "example:default",
        inputSummary: { message: "hello", token: "[redacted]" },
        outputSummary: { message: "ok" },
      }),
    ]);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fields: expect.objectContaining({ executionId: run?.executionId }) }),
        expect.objectContaining({
          fields: expect.objectContaining({ executionId: run?.executionId, auditPersisted: true }),
        }),
      ]),
    );
  });

  it("does not replace a successful action result when audit storage fails", async () => {
    const runs = new MemoryRunLogStore();
    runs.addError = new Error("secret-in-storage");
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "mcp" });

    expect(run).toMatchObject({
      auditPersisted: false,
      result: { ok: true, output: { message: "ok" } },
    });
    expect(JSON.stringify(entries)).not.toContain("secret-in-storage");
  });

  it("falls back to an unavailable summary without changing the action result", async () => {
    vi.spyOn(runLogSummary, "summarizeForRunLog").mockImplementationOnce(() => {
      throw new Error("secret-in-summary");
    });
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "web" });

    expect(run?.result).toEqual({ ok: true, output: { message: "ok" } });
    expect(runs.items[0]).toMatchObject({ inputSummary: "[unavailable]" });
    expect(JSON.stringify(entries)).not.toContain("secret-in-summary");
  });

  it("records unexpected execution errors as internal errors without logging the thrown value", async () => {
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({
      runs,
      logger,
      providerLoader: new TestProviderLoader(async () => {
        throw new Error("secret-in-executor");
      }),
    });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "http" });

    expect(run?.result).toEqual({
      ok: false,
      error: { code: "internal_error", message: "Action execution failed unexpectedly." },
    });
    expect(runs.items[0]).toMatchObject({ ok: false, errorCode: "internal_error" });
    expect(JSON.stringify(entries)).not.toContain("secret-in-executor");
  });

  it("retries next connection on retriable failure when connection is not pinned (G1a)", async () => {
    const runs = new MemoryRunLogStore();
    const { logger } = createTestLogger();
    let calls = 0;
    const store = new MemoryConnectionStore();
    const testProfile = {
      accountId: "acct",
      displayName: "Example",
      grantedScopes: [] as string[],
    };
    await store.set("example", "primary", {
      authType: "api_key",
      apiKey: "k1",
      values: { apiKey: "k1" },
      profile: testProfile,
      metadata: {},
    });
    await store.set("example", "spare", {
      authType: "api_key",
      apiKey: "k2",
      values: { apiKey: "k2" },
      profile: testProfile,
      metadata: {},
    });
    const catalog = createCatalogStore(
      [
        {
          ...exampleProvider,
          authTypes: ["api_key"],
          auth: [{ type: "api_key" }],
        },
      ],
      { executableActionIds: [echoAction.id] },
    );
    const providerLoader = new TestProviderLoader(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, error: { code: "rate_limit", message: "HTTP 429" } };
      }
      return { ok: true, output: { message: "ok" } };
    });
    const runner = new ActionRunner({
      catalog,
      providerLoader,
      connections: new ConnectionService({ catalog, providerLoader, store }),
      runs,
      logger,
      fallbackPolicy: { maxAttempts: 3, totalBudgetMs: 30_000, cooldownSec: 1 },
    });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "http" });

    expect(run?.result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(runs.items[0]).toMatchObject({
      ok: true,
      fallback: true,
      attempt: 2,
    });
    expect(runs.items[0]?.connectionName).toBeTruthy();
  });

  it("records policy denial before resolving a connection or loading an executor", async () => {
    const runs = new MemoryRunLogStore();
    const { logger } = createTestLogger();
    const providerLoader = new TestProviderLoader(async () => ({ ok: true, output: {} }));
    const loadExecutor = vi.spyOn(providerLoader, "loadActionExecutor");
    const resolveConnection = vi.spyOn(ConnectionService.prototype, "resolveForExecution");
    const actionPolicy = new ActionPolicyService({ blockedActions: ["example.echo"] });
    const denyEvents: Array<Record<string, unknown>> = [];
    const runner = createRunner({
      runs,
      logger,
      providerLoader,
      actionPolicy,
      onPolicyDeny: async (input) => {
        denyEvents.push({ ...input });
      },
    });

    const run = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      policy: actionPolicy.createSnapshot(),
      runtimeTokenId: "token-1",
      memberId: "mem-1",
    });

    expect(run).toMatchObject({
      result: { ok: false, error: { code: "action_blocked" } },
      auditPersisted: true,
    });
    expect(resolveConnection).not.toHaveBeenCalled();
    expect(loadExecutor).not.toHaveBeenCalled();
    expect(runs.items[0]).toMatchObject({
      runtimeTokenId: "token-1",
      policy: {
        allowed: false,
        checks: [{ source: "deployment", outcome: "block_match", rule: "example.echo" }],
      },
    });
    expect(denyEvents).toEqual([
      expect.objectContaining({
        actionId: "example.echo",
        service: "example",
        code: "action_blocked",
        memberId: "mem-1",
        runtimeTokenId: "token-1",
        caller: "http",
      }),
    ]);
  });

  it("blocks execution when connection is disabled (real ConnectionService path)", async () => {
    const runs = new MemoryRunLogStore();
    const { logger } = createTestLogger();
    const catalog = createCatalogStore([exampleProvider], { executableActionIds: [echoAction.id] });
    const providerLoader = new TestProviderLoader(async () => ({ ok: true, output: { message: "ok" } }));
    let executed = 0;
    const originalLoad = providerLoader.loadActionExecutor.bind(providerLoader);
    providerLoader.loadActionExecutor = async (...args) => {
      const executor = await originalLoad(...args);
      return async (input, ctx) => {
        executed += 1;
        return executor(input, ctx);
      };
    };
    const connections = new ConnectionService({
      catalog,
      providerLoader,
      store: new MemoryConnectionStore(),
      isConnectionDisabled: async (service, connectionName) => service === "example" && connectionName === "default",
    });
    const runner = new ActionRunner({
      catalog,
      providerLoader,
      connections,
      runs,
      logger,
    });

    const run = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      connectionName: "default",
    });

    expect(run?.result).toMatchObject({
      ok: false,
      error: { code: "connection_disabled" },
    });
    // resolveForExecution rejects before provider executor runs
    expect(executed).toBe(0);
    expect(runs.items[0]).toMatchObject({ ok: false, errorCode: "connection_disabled" });
  });
});

function createRunner(options: {
  runs: IRunLogStore;
  logger: Logger;
  providerLoader?: IProviderLoader;
  actionPolicy?: ActionPolicyService;
  onPolicyDeny?: ActionRunnerOptions["onPolicyDeny"];
}): ActionRunner {
  const catalog = createCatalogStore([exampleProvider], { executableActionIds: [echoAction.id] });
  const providerLoader =
    options.providerLoader ?? new TestProviderLoader(async () => ({ ok: true, output: { message: "ok" } }));
  return new ActionRunner({
    catalog,
    providerLoader,
    connections: new ConnectionService({ catalog, providerLoader, store: new MemoryConnectionStore() }),
    runs: options.runs,
    actionPolicy: options.actionPolicy,
    logger: options.logger,
    onPolicyDeny: options.onPolicyDeny,
  });
}

class TestProviderLoader implements IProviderLoader {
  private readonly executor: ActionExecutor;

  constructor(executor: ActionExecutor) {
    this.executor = executor;
  }

  async loadActionExecutor(): Promise<ActionExecutor> {
    return this.executor;
  }

  async loadProxyExecutor(): Promise<undefined> {
    return undefined;
  }

  async loadCredentialValidators(): Promise<undefined> {
    return undefined;
  }
}

class MemoryConnectionStore implements IConnectionStore {
  private readonly rows: StoredConnection[] = [];

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.rows.find((r) => r.service === service && r.connectionName === connectionName);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const row: StoredConnection = {
      id: crypto.randomUUID(),
      revision: crypto.randomUUID(),
      service,
      connectionName,
      credential,
    };
    const idx = this.rows.findIndex((r) => r.service === service && r.connectionName === connectionName);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
    return row;
  }

  async updateCredential(): Promise<boolean> {
    return false;
  }

  async delete(): Promise<void> {}

  async list(): Promise<StoredConnection[]> {
    return [...this.rows];
  }
}

class MemoryRunLogStore implements IRunLogStore {
  readonly items: RunLog[] = [];
  addError?: Error;

  async add(run: RunLog): Promise<{ retentionApplied: boolean }> {
    if (this.addError) throw this.addError;
    this.items.push(run);
    return { retentionApplied: true };
  }

  async get(id: string): Promise<RunLog | undefined> {
    return this.items.find((run) => run.id === id);
  }

  async list(_input?: RunLogListInput): Promise<RunLogPage> {
    return { items: this.items };
  }
}

type TestLogEntry = {
  fields: Record<string, unknown>;
  message: string;
};

function createTestLogger(): { entries: TestLogEntry[]; logger: Logger } {
  const entries: TestLogEntry[] = [];
  const record = (fields: Record<string, unknown>, message: string): void => {
    entries.push({ fields, message });
  };
  return {
    entries,
    logger: { info: record, warn: record } as unknown as Logger,
  };
}
