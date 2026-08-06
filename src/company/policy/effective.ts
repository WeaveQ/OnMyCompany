import type { MemberRecord } from "../auth/store.ts";

export interface EffectivePolicy {
  version: string;
  updatedAt: string;
  memberId?: string;
  roles: string[];
  policy: Record<string, unknown>;
  source: "org";
}

export function buildEffectivePolicy(input: {
  policy: Record<string, unknown>;
  version: string;
  updatedAt: string;
  member?: MemberRecord;
}): EffectivePolicy {
  return {
    version: input.version,
    updatedAt: input.updatedAt,
    memberId: input.member?.id,
    roles: input.member?.roles ?? [],
    policy: input.policy,
    source: "org",
  };
}
