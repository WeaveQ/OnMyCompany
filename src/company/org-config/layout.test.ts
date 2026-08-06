import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultOrgConfigRoot, ensureOrgConfigLayout } from "./layout.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ensureOrgConfigLayout", () => {
  it("creates CONFIG-SCHEMA skeleton under data/org/default/config", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-org-"));
    tempRoots.push(dataDir);
    const root = defaultOrgConfigRoot(dataDir);

    const first = await ensureOrgConfigLayout(root);
    expect(first.created).toBe(true);
    expect(first.root).toBe(root);

    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
      version: string;
      schemaVersion: number;
    };
    expect(manifest.version).toBe("cfg-0");
    expect(manifest.schemaVersion).toBe(1);

    const policy = JSON.parse(await readFile(join(root, "policy.json"), "utf8")) as {
      allowPersonalBYOK: boolean;
    };
    expect(policy.allowPersonalBYOK).toBe(true);

    for (const rel of ["models.json", "memory/settings.json", "tools/mcp.json", "tools/gateway.json"]) {
      const text = await readFile(join(root, rel), "utf8");
      expect(text.length).toBeGreaterThan(0);
    }

    const { access } = await import("node:fs/promises");
    for (const rel of ["skills", "experts/installed", "experts/mine"]) {
      await expect(access(join(root, rel))).resolves.toBeUndefined();
    }

    const second = await ensureOrgConfigLayout(root);
    expect(second.created).toBe(false);

    // does not clobber custom manifest
    await writeCustomManifest(root);
    await ensureOrgConfigLayout(root);
    const after = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as { version: string };
    expect(after.version).toBe("cfg-custom");
  });
});

async function writeCustomManifest(root: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({ version: "cfg-custom", updatedAt: new Date().toISOString(), schemaVersion: 1 }, null, 2),
    "utf8",
  );
}
