import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_TEAM_CHANGED_EVENT,
  clearMemberToken,
  getActiveTeamId,
  getMemberToken,
  hasMemberSession,
  memberAuthHeaders,
  setActiveTeamId,
  setMemberToken,
  subscribeActiveTeamId,
} from "./member-session";

afterEach(() => {
  clearMemberToken();
  // Reset active team storage between tests.
  try {
    sessionStorage.removeItem("omc_active_team_id");
  } catch {
    // ignore
  }
});

describe("member-session helpers", () => {
  it("stores and reads member token via shared key", () => {
    expect(hasMemberSession()).toBe(false);
    expect(memberAuthHeaders()).toEqual({});
    setMemberToken("omc_test_token");
    expect(getMemberToken()).toBe("omc_test_token");
    expect(hasMemberSession()).toBe(true);
    expect(memberAuthHeaders()).toEqual({ bearerToken: "omc_test_token" });
    clearMemberToken();
    expect(getMemberToken()).toBeUndefined();
    expect(hasMemberSession()).toBe(false);
  });

  it("persists active team id via shared storage", () => {
    setActiveTeamId("team_test_1");
    expect(getActiveTeamId()).toBe("team_test_1");
    setActiveTeamId("team_test_2");
    expect(getActiveTeamId()).toBe("team_test_2");
  });

  it("notifies subscribers when window is available", () => {
    // Node unit tests have no DOM; skip event path unless window exists.
    if (typeof window === "undefined") {
      expect(typeof subscribeActiveTeamId).toBe("function");
      expect(ACTIVE_TEAM_CHANGED_EVENT).toBe("omc-active-team-changed");
      return;
    }
    const onChange = vi.fn();
    const unsub = subscribeActiveTeamId(onChange);
    setActiveTeamId("team_test_3");
    expect(onChange).toHaveBeenCalledWith("team_test_3");
    unsub();
  });
});
