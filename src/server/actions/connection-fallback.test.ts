import { describe, expect, it, beforeEach } from "vitest";
import {
  clearConnectionCooldownsForTests,
  isRetriableExecutionError,
  markConnectionCooldown,
  orderConnectionCandidates,
  isConnectionCoolingDown,
} from "./connection-fallback.ts";

beforeEach(() => {
  clearConnectionCooldownsForTests();
});

describe("connection fallback helpers", () => {
  it("orders default first and cooled-down last", () => {
    markConnectionCooldown("svc", "default", 60);
    const ordered = orderConnectionCandidates("svc", ["beta", "default", "alpha"], undefined, Date.now());
    expect(ordered.map((c) => c.connectionName)).toEqual(["alpha", "beta", "default"]);
  });

  it("pins preferred connection only", () => {
    expect(orderConnectionCandidates("svc", ["a", "b"], "b")).toEqual([{ connectionName: "b" }]);
  });

  it("detects retriable vs non-retriable errors", () => {
    expect(isRetriableExecutionError({ code: "rate_limit", message: "429" })).toBe(true);
    expect(isRetriableExecutionError({ code: "upstream", message: "timeout" })).toBe(true);
    expect(isRetriableExecutionError({ code: "provider_error", message: "HTTP 503" })).toBe(true);
    expect(isRetriableExecutionError({ code: "connection_not_found", message: "missing" })).toBe(false);
    expect(isRetriableExecutionError({ code: "action_blocked", message: "no" })).toBe(false);
  });

  it("tracks cooldown window", () => {
    markConnectionCooldown("svc", "main", 60);
    expect(isConnectionCoolingDown("svc", "main")).toBe(true);
    expect(isConnectionCoolingDown("svc", "spare")).toBe(false);
  });
});
