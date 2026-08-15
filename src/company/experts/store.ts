import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureOrgConfigLayout } from "../org-config/layout.ts";
import { OrgConfigStore } from "../org-config/store.ts";

export interface ExpertPackageItem {
  packageId: string;
  name: string;
  description?: string;
  installed: boolean;
}

export class ExpertsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Expert packages live as directories under experts/installed (OrgConfig isomorphic).
 * Available catalog is experts/available (seeded). No chat / conversation handle.
 */
export class ExpertsStore {
  private readonly configRoot: string;
  private readonly orgStore: OrgConfigStore;

  constructor(configRoot: string, orgId = "default") {
    this.configRoot = configRoot;
    this.orgStore = new OrgConfigStore(configRoot, orgId);
  }

  async ensure(): Promise<void> {
    await ensureOrgConfigLayout(this.configRoot);
    await mkdir(this.availableRoot, { recursive: true });
    await mkdir(this.installedRoot, { recursive: true });
    await this.seedAvailable();
  }

  async listAvailable(): Promise<ExpertPackageItem[]> {
    await this.ensure();
    const installed = new Set(await this.listInstalledIds());
    const ids = await listDirNames(this.availableRoot);
    const items: ExpertPackageItem[] = [];
    for (const packageId of ids) {
      items.push({
        ...(await this.readMeta(join(this.availableRoot, packageId), packageId)),
        installed: installed.has(packageId),
      });
    }
    return items.sort((a, b) => a.packageId.localeCompare(b.packageId));
  }

  async listInstalled(): Promise<ExpertPackageItem[]> {
    await this.ensure();
    const ids = await this.listInstalledIds();
    const items: ExpertPackageItem[] = [];
    for (const packageId of ids) {
      const fromAvailable = join(this.availableRoot, packageId);
      items.push({
        ...(await this.readMeta(join(this.installedRoot, packageId), packageId).catch(async () =>
          this.readMeta(fromAvailable, packageId),
        )),
        installed: true,
      });
    }
    return items.sort((a, b) => a.packageId.localeCompare(b.packageId));
  }

  async enable(packageId: string): Promise<ExpertPackageItem> {
    await this.ensure();
    const id = packageId.trim();
    if (!id) throw new ExpertsError("validation_error", "packageId required");
    const source = join(this.availableRoot, id);
    const dest = join(this.installedRoot, id);
    const meta = await this.readMeta(source, id);
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, "README.md"), `# ${meta.name}\n\n${meta.description ?? ""}\n`, "utf8");
    await this.orgStore.bump();
    return { ...meta, installed: true };
  }

  async disable(packageId: string): Promise<void> {
    await this.ensure();
    const id = packageId.trim();
    if (!id) throw new ExpertsError("validation_error", "packageId required");
    const dest = join(this.installedRoot, id);
    const installed = await this.listInstalledIds();
    if (!installed.includes(id)) {
      throw new ExpertsError("not_found", `Expert not installed: ${id}`);
    }
    await rm(dest, { recursive: true, force: true });
    await this.orgStore.bump();
  }

  private get availableRoot(): string {
    return join(this.configRoot, "experts", "available");
  }

  private get installedRoot(): string {
    return join(this.configRoot, "experts", "installed");
  }

  private async listInstalledIds(): Promise<string[]> {
    return listDirNames(this.installedRoot);
  }

  private async readMeta(dir: string, packageId: string): Promise<Omit<ExpertPackageItem, "installed">> {
    let name = packageId;
    let description: string | undefined;
    try {
      const raw = await readFile(join(dir, "meta.json"), "utf8");
      const parsed = JSON.parse(raw) as { name?: string; description?: string };
      if (parsed.name) name = parsed.name;
      if (parsed.description) description = parsed.description;
    } catch {
      try {
        const readme = await readFile(join(dir, "README.md"), "utf8");
        const title = readme.match(/^#\s+(.+)$/m)?.[1];
        if (title) name = title.trim();
      } catch {
        /* seed name */
      }
    }
    return { packageId, name, description };
  }

  private async seedAvailable(): Promise<void> {
    const seeds: Array<{ packageId: string; name: string; description: string }> = [
      {
        packageId: "ops-oncall@1.0.0",
        name: "Ops on-call",
        description: "Persona pack for incident triage. Desktop-only; no company chat.",
      },
      {
        packageId: "sales-brief@1.0.0",
        name: "Sales brief",
        description: "Persona pack for account summaries. Desktop-only; no company chat.",
      },
    ];
    for (const seed of seeds) {
      const dir = join(this.availableRoot, seed.packageId);
      await mkdir(dir, { recursive: true });
      const metaPath = join(dir, "meta.json");
      try {
        await readFile(metaPath, "utf8");
      } catch {
        await writeFile(metaPath, `${JSON.stringify({ name: seed.name, description: seed.description }, null, 2)}\n`);
        await writeFile(join(dir, "README.md"), `# ${seed.name}\n\n${seed.description}\n`);
      }
    }
  }
}

async function listDirNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
