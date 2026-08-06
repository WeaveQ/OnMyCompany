/**
 * In-flight request caps (G0): global + optional per-member.
 * Used by ConnectServer middleware on /v1/* execution paths.
 */

export interface ConcurrencyGuardOptions {
  maxGlobal: number;
  maxPerMember: number;
}

export type ConcurrencyAcquireResult =
  | {
      ok: true;
      release(): void;
    }
  | {
      ok: false;
      reason: "global" | "member";
      globalInFlight: number;
      memberInFlight: number;
    };

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class ConcurrencyGuard {
  private global = 0;
  private readonly byMember = new Map<string, number>();
  readonly maxGlobal: number;
  readonly maxPerMember: number;

  constructor(options: ConcurrencyGuardOptions) {
    this.maxGlobal = Math.max(1, options.maxGlobal);
    this.maxPerMember = Math.max(1, options.maxPerMember);
  }

  get snapshot(): { globalInFlight: number; members: number } {
    return { globalInFlight: this.global, members: this.byMember.size };
  }

  acquire(memberKey?: string): ConcurrencyAcquireResult {
    const key = memberKey?.trim() || "";
    const memberCount = key ? (this.byMember.get(key) ?? 0) : 0;

    if (this.global >= this.maxGlobal) {
      return {
        ok: false,
        reason: "global",
        globalInFlight: this.global,
        memberInFlight: memberCount,
      };
    }
    if (key && memberCount >= this.maxPerMember) {
      return {
        ok: false,
        reason: "member",
        globalInFlight: this.global,
        memberInFlight: memberCount,
      };
    }

    this.global += 1;
    if (key) {
      this.byMember.set(key, memberCount + 1);
    }

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.global = Math.max(0, this.global - 1);
        if (key) {
          const next = (this.byMember.get(key) ?? 1) - 1;
          if (next <= 0) this.byMember.delete(key);
          else this.byMember.set(key, next);
        }
      },
    };
  }
}

/** Shared process-wide guard — limits read once from env at first use. */
let sharedGuard: ConcurrencyGuard | undefined;

export function getSharedConcurrencyGuard(): ConcurrencyGuard {
  if (!sharedGuard) {
    sharedGuard = new ConcurrencyGuard({
      maxGlobal: positiveInt(process.env.OMC_MAX_IN_FLIGHT, 100),
      maxPerMember: positiveInt(process.env.OMC_MAX_IN_FLIGHT_PER_MEMBER, 10),
    });
  }
  return sharedGuard;
}

/** Test-only reset. */
export function resetSharedConcurrencyGuardForTests(): void {
  sharedGuard = undefined;
}
