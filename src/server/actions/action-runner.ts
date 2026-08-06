import type { CatalogStore, RuntimeActionDefinition } from "../../catalog-store.ts";
import type { ConnectionService, ConnectionSummary, ExecutionConnection } from "../../connection-service.ts";
import type { ActionPolicyDecision, ActionPolicyService, ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ExecutionContext, ExecutionResult, TransitFileWriter } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";
import type { IRunLogStore, RunLog, RunLogCaller, RunLogListInput, RunLogPage } from "../storage/runtime-store.ts";
import type { FallbackPolicy } from "./connection-fallback.ts";

import { ConnectionError } from "../../connection-service.ts";
import { executeAction as executeProviderAction } from "../../core/execution.ts";
import {
  DEFAULT_FALLBACK_POLICY,
  isRetriableExecutionError,
  markConnectionCooldown,
  orderConnectionCandidates,
} from "./connection-fallback.ts";
import { safeRunLogError, summarizeForRunLog } from "./run-log-summary.ts";

export interface ActionRunnerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  runs: IRunLogStore;
  transitFiles?: TransitFileWriter;
  actionPolicy?: ActionPolicyService;
  logger?: Logger;
  fallbackPolicy?: Partial<FallbackPolicy>;
  /**
   * Company audit hook when action policy denies execution (no secrets).
   */
  onPolicyDeny?: (input: {
    actionId: string;
    service: string;
    code?: string;
    message?: string;
    memberId?: string;
    runtimeTokenId?: string;
    caller: RunLogCaller;
  }) => void | Promise<void>;
}

export interface RunActionInput {
  actionId: string;
  input: unknown;
  caller: RunLogCaller;
  connectionName?: string;
  policy?: ActionPolicySnapshot;
  runtimeTokenId?: string;
  memberId?: string;
  teamId?: string;
}

export interface ActionRunResult {
  executionId: string;
  auditPersisted: boolean;
  result: ExecutionResult;
  connection?: ConnectionSummary;
}

/**
 * Shared execution boundary for HTTP, MCP, and future local callers.
 * G1a: when connection is not pinned, try ordered candidates on retriable failures.
 */
export class ActionRunner {
  private readonly options: ActionRunnerOptions;
  private readonly fallbackPolicy: FallbackPolicy;

  constructor(options: ActionRunnerOptions) {
    this.options = options;
    this.fallbackPolicy = { ...DEFAULT_FALLBACK_POLICY, ...options.fallbackPolicy };
  }

  async run(input: RunActionInput): Promise<ActionRunResult | undefined> {
    const action = this.options.catalog.actionsById.get(input.actionId);
    if (!action) {
      this.options.logger?.warn(
        { actionId: input.actionId, caller: input.caller, errorCode: "invalid_input" },
        "action run rejected",
      );
      return undefined;
    }

    const executionId = crypto.randomUUID();
    const logContext = {
      actionId: action.id,
      service: action.service,
      caller: input.caller,
      executionId,
    };
    this.options.logger?.info(logContext, "action run started");

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const policy: ActionPolicyDecision = (input.policy ?? this.options.actionPolicy?.createSnapshot())?.evaluate(
      action,
    ) ?? {
      allowed: true,
      checks: [],
    };

    let connection: ExecutionConnection | undefined;
    let result: ExecutionResult;
    let attempt = 1;
    let fallback = false;
    let usedConnectionName: string | undefined;

    if (!policy.allowed) {
      result = { ok: false, error: { code: policy.code, message: policy.message } };
      try {
        await this.options.onPolicyDeny?.({
          actionId: action.id,
          service: action.service,
          code: policy.code,
          message: policy.message,
          memberId: input.memberId,
          runtimeTokenId: input.runtimeTokenId,
          caller: input.caller,
        });
      } catch {
        // audit must not break execution path
      }
    } else {
      const executed = await this.executeWithConnectionFallback({
        service: action.service,
        actionId: action.id,
        action,
        input: input.input,
        pinnedConnectionName: input.connectionName,
        startedAtMs,
        logContext,
      });
      result = executed.result;
      connection = executed.connection;
      attempt = executed.attempt;
      fallback = executed.fallback;
      usedConnectionName = executed.connectionName;
    }

    const completedAtMs = Date.now();
    const durationMs = completedAtMs - startedAtMs;
    const auditError = safeRunLogError(result.error);
    const runLog: RunLog = {
      id: executionId,
      service: action.service,
      actionId: input.actionId,
      caller: input.caller,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs,
      ok: result.ok,
      connectionId: connection?.summary?.id,
      connectionProfile: connection?.summary?.profile,
      connectionName: usedConnectionName ?? connection?.summary?.connectionName,
      attempt: policy.allowed ? attempt : undefined,
      fallback: policy.allowed && fallback ? true : policy.allowed ? false : undefined,
      runtimeTokenId: input.runtimeTokenId,
      memberId: input.memberId,
      teamId: input.teamId,
      policy,
      inputSummary: this.summarizeAuditValue(input.input, logContext),
      outputSummary: result.ok ? this.summarizeAuditValue(result.output, logContext) : undefined,
      ...auditError,
    };

    let auditPersisted = false;
    try {
      const write = await this.options.runs.add(runLog);
      auditPersisted = true;
      if (!write.retentionApplied) {
        this.options.logger?.warn({ ...logContext, auditPersisted }, "run audit retention failed");
      }
    } catch {
      this.options.logger?.warn({ ...logContext, auditPersisted }, "run audit persistence failed");
    }

    const completedLogContext = {
      ...logContext,
      connectionId: connection?.summary?.id,
      connectionName: usedConnectionName,
      attempt,
      fallback,
      durationMs,
      ok: result.ok,
      errorCode: result.error?.code,
      auditPersisted,
    };
    if (result.ok) {
      this.options.logger?.info(completedLogContext, "action run completed");
    } else {
      this.options.logger?.warn(completedLogContext, "action run failed");
    }

    return { executionId, auditPersisted, result, connection: connection?.summary };
  }

  listRuns(input?: RunLogListInput): Promise<RunLogPage> {
    return this.options.runs.list(input);
  }

  getRun(id: string): Promise<RunLog | undefined> {
    return this.options.runs.get(id);
  }

  private async executeWithConnectionFallback(input: {
    service: string;
    actionId: string;
    action: RuntimeActionDefinition;
    input: unknown;
    pinnedConnectionName?: string;
    startedAtMs: number;
    logContext: Record<string, unknown>;
  }): Promise<{
    result: ExecutionResult;
    connection?: ExecutionConnection;
    attempt: number;
    fallback: boolean;
    connectionName?: string;
  }> {
    const candidates = await this.resolveCandidates(input.service, input.pinnedConnectionName);
    const pinned = Boolean(input.pinnedConnectionName?.trim());
    const deadline = input.startedAtMs + this.fallbackPolicy.totalBudgetMs;
    const maxAttempts = Math.min(this.fallbackPolicy.maxAttempts, Math.max(1, candidates.length));

    // Load executor once per action (not per connection attempt).
    const displayName = this.options.catalog.providers.find((p) => p.service === input.service)?.displayName;
    const executor = input.action.execution.locallyExecutable
      ? await this.options.providerLoader.loadActionExecutor(input.service, input.actionId, displayName)
      : undefined;

    let lastResult: ExecutionResult = {
      ok: false,
      error: { code: "connection_not_found", message: `No connection available for ${input.service}.` },
    };
    let lastConnection: ExecutionConnection | undefined;
    let lastName: string | undefined;
    let attempt = 1;
    let fallback = false;

    for (let i = 0; i < maxAttempts; i += 1) {
      if (i > 0 && Date.now() > deadline) {
        break;
      }
      const candidate = candidates[i]!;
      attempt = i + 1;
      fallback = i > 0;
      lastName = candidate.connectionName;

      try {
        lastConnection = await this.options.connections.resolveForExecution(input.service, candidate.connectionName);
        lastResult = await executeProviderAction(
          input.action,
          executor,
          input.input,
          this.createExecutionContext(lastConnection.getCredential),
        );
      } catch (error) {
        lastResult =
          error instanceof ConnectionError
            ? { ok: false, error: { code: error.code, message: error.message } }
            : {
                ok: false,
                error: { code: "internal_error", message: "Action execution failed unexpectedly." },
              };
        lastConnection = undefined;
      }

      if (lastResult.ok) {
        break;
      }

      const retriable = isRetriableExecutionError(lastResult.error);
      // Cooldown only when multi-candidate failover is in play (not a pinned single connection).
      if (retriable && !pinned) {
        markConnectionCooldown(input.service, candidate.connectionName, this.fallbackPolicy.cooldownSec);
      }
      const hasNext = i + 1 < maxAttempts && !pinned;
      if (!retriable || !hasNext || Date.now() > deadline) {
        break;
      }
      this.options.logger?.warn(
        {
          ...input.logContext,
          connectionName: candidate.connectionName,
          attempt,
          errorCode: lastResult.error?.code,
        },
        "action connection attempt failed; trying fallback",
      );
    }

    return {
      result: lastResult,
      connection: lastConnection,
      attempt,
      fallback,
      connectionName: lastName,
    };
  }

  private async resolveCandidates(service: string, pinnedName?: string): Promise<Array<{ connectionName: string }>> {
    if (pinnedName?.trim()) {
      return [{ connectionName: pinnedName.trim() }];
    }
    try {
      const listed = await this.options.connections.listConnectionsByService(service);
      const names = listed.map((c) => c.connectionName).filter(Boolean);
      if (names.length === 0) {
        return [{ connectionName: "default" }];
      }
      return orderConnectionCandidates(service, names);
    } catch {
      return [{ connectionName: "default" }];
    }
  }

  private createExecutionContext(getCredential: ExecutionConnection["getCredential"]): ExecutionContext {
    const context: ExecutionContext = { getCredential };
    if (this.options.transitFiles) {
      context.transitFiles = this.options.transitFiles;
    }
    return context;
  }

  private summarizeAuditValue(value: unknown, logContext: Record<string, unknown>): unknown {
    try {
      return summarizeForRunLog(value);
    } catch {
      this.options.logger?.warn(logContext, "run audit summary unavailable");
      return "[unavailable]";
    }
  }
}
