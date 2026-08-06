import type { ActionPolicyDecision } from "../../core/action-policy.ts";
import type { CredentialProfile } from "../../core/types.ts";

export const DEFAULT_RUN_LIMIT = 5_000;

export type RunLogCaller = "http" | "mcp" | "web";

/**
 * One recent action run shown by the local runtime.
 */
export interface RunLog {
  id: string;
  service: string;
  actionId: string;
  caller: RunLogCaller;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  connectionId?: string;
  connectionProfile?: CredentialProfile;
  /** Connection name used for this attempt (G1a). */
  connectionName?: string;
  /** 1-based attempt index when connection fallback is enabled. */
  attempt?: number;
  /** True when a later connection succeeded after an earlier failure. */
  fallback?: boolean;
  runtimeTokenId?: string;
  /** Org member attributed to this run when known (M3b). */
  memberId?: string;
  /** Active team when known (optional; may be filled by callers later). */
  teamId?: string;
  policy?: ActionPolicyDecision;
  inputSummary?: unknown;
  outputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunLogListInput {
  limit?: number;
  cursor?: string;
  service?: string;
  actionId?: string;
  caller?: RunLogCaller;
  ok?: boolean;
  /** Org member attributed to the run (when known). */
  memberId?: string;
}

export interface RunLogPage {
  items: RunLog[];
  nextCursor?: string;
}

export interface RunLogWriteResult {
  retentionApplied: boolean;
}

export interface RunLogCursor {
  startedAt: string;
  id: string;
}

export function encodeRunLogCursor(run: RunLog): string {
  return encodeURIComponent(JSON.stringify({ startedAt: run.startedAt, id: run.id } satisfies RunLogCursor));
}

export function decodeRunLogCursor(cursor: string | undefined): RunLogCursor | undefined {
  if (cursor === undefined || cursor === "") {
    return undefined;
  }

  const value = JSON.parse(decodeURIComponent(cursor)) as Partial<RunLogCursor>;
  if (typeof value.startedAt !== "string" || typeof value.id !== "string") {
    throw new Error("Invalid run log cursor.");
  }

  return {
    startedAt: value.startedAt,
    id: value.id,
  };
}

/**
 * Storage contract for recent action run logs.
 */
export interface IRunLogStore {
  add(run: RunLog): Promise<RunLogWriteResult>;
  get(id: string): Promise<RunLog | undefined>;
  list(input?: RunLogListInput): Promise<RunLogPage>;
}
