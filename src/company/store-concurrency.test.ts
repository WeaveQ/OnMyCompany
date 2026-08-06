/**
 * Concurrent mutations on real JSON stores must not drop updates.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanyAuditEventStore } from "./audit/events.ts";
import { ConnectionDisableStore } from "./connections/disable-store.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("company JSON store concurrency", () => {
  it("keeps all concurrent audit appends on disk", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-conc-audit-"));
    tempRoots.push(dataDir);
    const store = new CompanyAuditEventStore(dataDir);

    const n = 40;
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        store.append({
          type: "token.create",
          actorEmail: `u${i}@test.local`,
          details: { tokenId: `tok-${i}`, name: `n-${i}` },
        }),
      ),
    );

    const listed = await store.listAll();
    expect(listed).toHaveLength(n);
    const tokenIds = listed.map((e) => e.details?.tokenId).filter(Boolean);
    expect(tokenIds).toHaveLength(n);
    expect(new Set(tokenIds).size).toBe(n);

    // On-disk file matches list (queue + atomic write).
    const raw = JSON.parse(await readFile(join(dataDir, "company", "audit-events.json"), "utf8")) as {
      events: unknown[];
    };
    expect(raw.events).toHaveLength(n);
  });

  it("serializes concurrent disable toggles without wiping unrelated keys", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-conc-dis-"));
    tempRoots.push(dataDir);
    const store = new ConnectionDisableStore(dataDir);

    await Promise.all([
      store.setDisabled("github", "default", true),
      store.setDisabled("gmail", "work", true),
      store.setDisabled("notion", "default", true),
      store.setDisabled("github", "default", false),
      store.setDisabled("slack", "default", true),
    ]);

    await expect(store.isDisabled("github", "default")).resolves.toBe(false);
    await expect(store.isDisabled("gmail", "work")).resolves.toBe(true);
    await expect(store.isDisabled("notion", "default")).resolves.toBe(true);
    await expect(store.isDisabled("slack", "default")).resolves.toBe(true);

    const listed = await store.listDisabled();
    const keys = new Set(listed.map((k) => `${k.service}::${k.connectionName}`));
    expect(keys.has("gmail::work")).toBe(true);
    expect(keys.has("notion::default")).toBe(true);
    expect(keys.has("slack::default")).toBe(true);
    expect(keys.has("github::default")).toBe(false);
  });
});
