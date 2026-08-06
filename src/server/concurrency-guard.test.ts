import { describe, expect, it, beforeEach } from "vitest";
import { ConcurrencyGuard, resetSharedConcurrencyGuardForTests } from "./concurrency-guard.ts";

beforeEach(() => {
  resetSharedConcurrencyGuardForTests();
});

describe("ConcurrencyGuard", () => {
  it("enforces global cap", () => {
    const g = new ConcurrencyGuard({ maxGlobal: 2, maxPerMember: 10 });
    const a = g.acquire("m1");
    const b = g.acquire("m2");
    expect(a.ok && b.ok).toBe(true);
    const c = g.acquire("m3");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("global");
    if (a.ok) a.release();
    const d = g.acquire("m3");
    expect(d.ok).toBe(true);
    if (d.ok) d.release();
    if (b.ok) b.release();
  });

  it("enforces per-member cap", () => {
    const g = new ConcurrencyGuard({ maxGlobal: 50, maxPerMember: 1 });
    const a = g.acquire("m1");
    expect(a.ok).toBe(true);
    const b = g.acquire("m1");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("member");
    if (a.ok) a.release();
    const c = g.acquire("m1");
    expect(c.ok).toBe(true);
    if (c.ok) c.release();
  });
});
