import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectionTeamGrantStore } from "./team-grants.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("ConnectionTeamGrantStore.isTeamAllowed", () => {
  it("allows any team when the grant list is missing or empty", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-grants-"));
    tempRoots.push(dataDir);
    const store = new ConnectionTeamGrantStore(dataDir);
    await expect(store.isTeamAllowed("github", "default", undefined)).resolves.toBe(true);
    await expect(store.isTeamAllowed("github", "default", "team-a")).resolves.toBe(true);
    await store.setTeamIds("github", "default", []);
    await expect(store.isTeamAllowed("github", "default", undefined)).resolves.toBe(true);
  });

  it("denies a missing header and a non-matching team when the grant list is non-empty", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-grants-"));
    tempRoots.push(dataDir);
    const store = new ConnectionTeamGrantStore(dataDir);
    await store.setTeamIds("github", "default", ["team-a"]);
    await expect(store.isTeamAllowed("github", "default", undefined)).resolves.toBe(false);
    await expect(store.isTeamAllowed("github", "default", "")).resolves.toBe(false);
    await expect(store.isTeamAllowed("github", "default", "team-b")).resolves.toBe(false);
    await expect(store.isTeamAllowed("github", "default", "team-a")).resolves.toBe(true);
  });
});
