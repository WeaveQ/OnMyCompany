import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { ConnectionDisableStore } from "./disable-store.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("ConnectionDisableStore", () => {
  it("toggles disabled flags without storing secrets", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-cdis-"));
    tempRoots.push(dataDir);
    const store = new ConnectionDisableStore(dataDir);
    await expect(store.isDisabled("github", "default")).resolves.toBe(false);
    await store.setDisabled("github", "default", true);
    await expect(store.isDisabled("github", "default")).resolves.toBe(true);
    await expect(store.isDisabled("github", "work")).resolves.toBe(false);
    const listed = await store.listDisabled();
    expect(listed).toEqual([{ service: "github", connectionName: "default" }]);
    await store.setDisabled("github", "default", false);
    await expect(store.isDisabled("github")).resolves.toBe(false);
  });
});
