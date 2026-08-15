import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureOrgConfigLayout } from "../org-config/layout.ts";
import { OrgConfigStore } from "../org-config/store.ts";

export interface ExpertPackageItem {
  packageId: string;
  name: string;
  description?: string;
  installed: boolean;
  version?: string;
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

  async getDetail(packageId: string): Promise<{ item: ExpertPackageItem; readme?: string } | undefined> {
    await this.ensure();
    const id = packageId.trim();
    if (!id) return undefined;
    const installed = (await this.listInstalledIds()).includes(id);
    const available = (await listDirNames(this.availableRoot)).includes(id);
    if (!installed && !available) return undefined;
    const dir = installed ? join(this.installedRoot, id) : join(this.availableRoot, id);
    const item = { ...(await this.readMeta(dir, id)), installed };
    let readme: string | undefined;
    try {
      readme = await readFile(join(dir, "README.md"), "utf8");
    } catch {
      readme = undefined;
    }
    return { item, readme };
  }

  async upload(input: {
    packageId: string;
    name?: string;
    description?: string;
    readme: string;
    enable?: boolean;
  }): Promise<ExpertPackageItem> {
    await this.ensure();
    const id = input.packageId.trim();
    if (!id || id.includes("/") || id.includes("..")) {
      throw new ExpertsError("validation_error", "packageId required");
    }
    const readme = input.readme.trim();
    if (!readme) throw new ExpertsError("validation_error", "readme required");
    const name = input.name?.trim() || id;
    const description = input.description?.trim();
    const dir = join(this.availableRoot, id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "meta.json"),
      `${JSON.stringify({ name, description: description || undefined }, null, 2)}\n`,
    );
    await writeFile(join(dir, "README.md"), `${readme.endsWith("\n") ? readme : `${readme}\n`}`);
    if (input.enable !== false) {
      return this.enable(id);
    }
    return { packageId: id, name, description, installed: false, version: versionOf(id) };
  }

  async enable(packageId: string): Promise<ExpertPackageItem> {
    await this.ensure();
    const id = packageId.trim();
    if (!id) throw new ExpertsError("validation_error", "packageId required");
    const source = join(this.availableRoot, id);
    const dest = join(this.installedRoot, id);
    const meta = await this.readMeta(source, id);
    await mkdir(dest, { recursive: true });
    try {
      const readme = await readFile(join(source, "README.md"), "utf8");
      await writeFile(join(dest, "README.md"), readme);
    } catch {
      await writeFile(join(dest, "README.md"), `# ${meta.name}\n\n${meta.description ?? ""}\n`, "utf8");
    }
    try {
      const raw = await readFile(join(source, "meta.json"), "utf8");
      await writeFile(join(dest, "meta.json"), raw);
    } catch {
      /* seed-only name */
    }
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
    return { packageId, name, description, version: versionOf(packageId) };
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

function versionOf(packageId: string): string | undefined {
  const at = packageId.lastIndexOf("@");
  return at > 0 ? packageId.slice(at + 1) : undefined;
}

async function listDirNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
