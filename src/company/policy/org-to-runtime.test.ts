import { describe, expect, it } from "vitest";
import { orgPolicyToRuntimeRules } from "./org-to-runtime.ts";

describe("orgPolicyToRuntimeRules", () => {
  it("maps flat lists", () => {
    const rules = orgPolicyToRuntimeRules({
      allowedActions: ["mail.*"],
      blockedActions: ["mail.send"],
      allowedProxies: [],
      blockedProxies: ["*"],
    });
    expect(rules.allowedActions).toEqual(["mail.*"]);
    expect(rules.blockedActions).toEqual(["mail.send"]);
    expect(rules.blockedProxies).toEqual(["*"]);
  });

  it("maps nested actions/proxies shape", () => {
    const rules = orgPolicyToRuntimeRules({
      actions: { allowed: ["*"], blocked: ["admin.*"] },
      proxies: { allowed: ["http"], blocked: [] },
    });
    expect(rules.allowedActions).toEqual(["*"]);
    expect(rules.blockedActions).toEqual(["admin.*"]);
    expect(rules.allowedProxies).toEqual(["http"]);
  });
});
