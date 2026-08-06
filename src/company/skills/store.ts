import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ensureOrgConfigLayout } from "../org-config/layout.ts";

export interface SkillPackageMeta {
  packageId: string;
  name: string;
  visibility: "public" | "personal" | "org";
  skillCount: number;
  description?: string;
  ownerMemberId?: string;
  source: "seed" | "upload" | "personal";
  createdAt: string;
  /** Roles that may see this package when enabled (empty = all members). S5 */
  visibleToRoles?: string[];
  shareToken?: string;
}

export interface EnabledSkillEntry {
  packageId: string;
  ref: string;
  source: string;
  enabledAt: string;
  enabledBy?: string;
  visibleToRoles?: string[];
  shareToken?: string;
}

export interface SkillPackageListItem extends SkillPackageMeta {
  added: boolean;
  skillCount: number;
}

interface EnabledFile {
  enabled: EnabledSkillEntry[];
}

export class SkillsStore {
  private readonly configRoot: string;
  private readonly dataDir: string;
  private readonly skillsRoot: string;

  constructor(configRoot: string, dataDir: string) {
    this.configRoot = configRoot;
    this.dataDir = dataDir;
    this.skillsRoot = join(configRoot, "skills");
  }

  async ensure(): Promise<void> {
    await ensureOrgConfigLayout(this.configRoot);
    await mkdir(join(this.skillsRoot, "registry", "public"), { recursive: true });
    await mkdir(join(this.skillsRoot, "registry", "personal"), { recursive: true });
    await mkdir(join(this.skillsRoot, "installed"), { recursive: true });
    if (!(await exists(join(this.skillsRoot, "enabled.json")))) {
      await writeJson(join(this.skillsRoot, "enabled.json"), { enabled: [] });
    }
    await this.seedPublicRegistry();
  }

  async listPublic(q?: string): Promise<SkillPackageListItem[]> {
    await this.ensure();
    const enabled = new Set((await this.readEnabled()).enabled.map((e) => e.packageId));
    const items = await this.scanRegistry(join(this.skillsRoot, "registry", "public"));
    return filterAndMark(items, enabled, q);
  }

  async listMine(memberId: string, q?: string): Promise<SkillPackageListItem[]> {
    await this.ensure();
    const enabled = new Set((await this.readEnabled()).enabled.map((e) => e.packageId));
    const root = join(this.skillsRoot, "registry", "personal", memberId);
    await mkdir(root, { recursive: true });
    const items = await this.scanRegistry(root);
    return filterAndMark(items, enabled, q);
  }

  async listOrgEnabled(q?: string): Promise<SkillPackageListItem[]> {
    await this.ensure();
    const enabled = await this.readEnabled();
    const out: SkillPackageListItem[] = [];
    for (const entry of enabled.enabled) {
      const meta = await this.readMetaByPackageId(entry.packageId);
      if (!meta) {
        out.push({
          packageId: entry.packageId,
          name: entry.packageId,
          visibility: "org",
          skillCount: 0,
          source: "upload",
          createdAt: entry.enabledAt,
          added: true,
          visibleToRoles: entry.visibleToRoles,
          shareToken: entry.shareToken,
        });
        continue;
      }
      if (q && !matchesQuery(meta, q)) continue;
      out.push({
        ...meta,
        added: true,
        visibleToRoles: entry.visibleToRoles ?? meta.visibleToRoles,
        shareToken: entry.shareToken ?? meta.shareToken,
      });
    }
    return out;
  }

  async getDetail(packageId: string): Promise<{ meta: SkillPackageMeta; skillMd?: string } | undefined> {
    await this.ensure();
    const dir = await this.resolvePackageDir(packageId);
    if (!dir) return undefined;
    const meta = await readMeta(dir);
    if (!meta) return undefined;
    let skillMd: string | undefined;
    try {
      skillMd = await readFile(join(dir, "SKILL.md"), "utf8");
    } catch {
      skillMd = undefined;
    }
    return { meta, skillMd };
  }

  async enable(packageId: string, enabledBy?: string): Promise<EnabledSkillEntry> {
    await this.ensure();
    const meta = await this.readMetaByPackageId(packageId);
    if (!meta) {
      throw new SkillsError("not_found", `Package not found: ${packageId}`);
    }
    const data = await this.readEnabled();
    const existing = data.enabled.find((e) => e.packageId === packageId);
    if (existing) return existing;
    const dir = await this.resolvePackageDir(packageId);
    const entry: EnabledSkillEntry = {
      packageId,
      ref: dir ? relativeToSkills(this.skillsRoot, dir) : packageId,
      source: meta.source,
      enabledAt: new Date().toISOString(),
      enabledBy,
    };
    data.enabled.push(entry);
    await writeJson(join(this.skillsRoot, "enabled.json"), data);
    // materialize into installed for desktop mirror
    if (dir) {
      await copyPackage(dir, join(this.skillsRoot, "installed", safeDirName(packageId)));
    }
    return entry;
  }

  async disable(packageId: string): Promise<void> {
    await this.ensure();
    const data = await this.readEnabled();
    data.enabled = data.enabled.filter((e) => e.packageId !== packageId);
    await writeJson(join(this.skillsRoot, "enabled.json"), data);
  }

  async removePackage(packageId: string): Promise<void> {
    await this.disable(packageId);
    const dir = await this.resolvePackageDir(packageId);
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
    await rm(join(this.skillsRoot, "installed", safeDirName(packageId)), { recursive: true, force: true });
  }

  async uploadPackage(input: {
    packageId: string;
    name: string;
    skillMarkdown: string;
    scope: "public" | "personal";
    memberId?: string;
    description?: string;
    visibleToRoles?: string[];
    extraFiles?: Array<{ path: string; data: Buffer | string }>;
  }): Promise<SkillPackageMeta> {
    await this.ensure();
    const packageId = normalizePackageId(input.packageId);
    if (!packageId.includes("@")) {
      throw new SkillsError("validation_error", "packageId must look like name@version");
    }
    const parent =
      input.scope === "public"
        ? join(this.skillsRoot, "registry", "public")
        : join(this.skillsRoot, "registry", "personal", input.memberId || "unknown");
    await mkdir(parent, { recursive: true });
    const dir = join(parent, safeDirName(packageId));
    await mkdir(dir, { recursive: true });
    const meta: SkillPackageMeta = {
      packageId,
      name: input.name.trim() || packageId,
      visibility: input.scope === "public" ? "public" : "personal",
      skillCount: 1,
      description: input.description,
      ownerMemberId: input.memberId,
      source: "upload",
      createdAt: new Date().toISOString(),
      visibleToRoles: input.visibleToRoles?.length ? input.visibleToRoles : undefined,
    };
    await writeJson(join(dir, "meta.json"), meta);
    await writeFile(
      join(dir, "SKILL.md"),
      input.skillMarkdown.endsWith("\n") ? input.skillMarkdown : `${input.skillMarkdown}\n`,
      "utf8",
    );
    if (input.extraFiles) {
      for (const file of input.extraFiles) {
        if (!file.path || file.path.includes("..") || file.path === "meta.json") continue;
        const dest = join(dir, file.path);
        await mkdir(join(dest, ".."), { recursive: true });
        await writeFile(dest, file.data);
      }
    }
    return meta;
  }

  async uploadZipPackage(input: {
    zipBuffer: Buffer;
    packageId?: string;
    name?: string;
    scope: "public" | "personal";
    memberId?: string;
    description?: string;
  }): Promise<SkillPackageMeta> {
    const { extractZipEntries, findSkillMarkdown } = await import("./zip.ts");
    const entries = extractZipEntries(input.zipBuffer);
    const { skillMd, packageHint } = findSkillMarkdown(entries);
    const packageId =
      input.packageId?.trim() ||
      (packageHint?.includes("@") ? packageHint : `${packageHint || "uploaded-skill"}@0.1.0`);
    const name = input.name?.trim() || packageId.split("@")[0] || packageId;
    const extraFiles = entries
      .filter((e) => !/(^|\/)SKILL\.md$/i.test(e.path) && !/(^|\/)meta\.json$/i.test(e.path))
      .map((e) => ({ path: e.path.replace(/^[^/]+\//, ""), data: e.data }));
    return this.uploadPackage({
      packageId,
      name,
      skillMarkdown: skillMd,
      scope: input.scope,
      memberId: input.memberId,
      description: input.description,
      extraFiles,
    });
  }

  /** S5: set which roles may see an enabled package (empty = all). */
  async setVisibility(packageId: string, visibleToRoles: string[]): Promise<EnabledSkillEntry> {
    await this.ensure();
    const data = await this.readEnabled();
    const entry = data.enabled.find((e) => e.packageId === packageId);
    if (!entry) {
      throw new SkillsError("not_found", `Package not enabled: ${packageId}`);
    }
    entry.visibleToRoles = visibleToRoles.length ? visibleToRoles : undefined;
    await writeJson(join(this.skillsRoot, "enabled.json"), data);
    const dir = await this.resolvePackageDir(packageId);
    if (dir) {
      const meta = await readMeta(dir);
      if (meta) {
        meta.visibleToRoles = entry.visibleToRoles;
        await writeJson(join(dir, "meta.json"), meta);
      }
    }
    return entry;
  }

  /** S5: mint or return share token for package. */
  async createShareToken(packageId: string): Promise<{ packageId: string; shareToken: string; sharePath: string }> {
    await this.ensure();
    const data = await this.readEnabled();
    const entry = data.enabled.find((e) => e.packageId === packageId);
    if (!entry) {
      throw new SkillsError("not_found", `Package not enabled: ${packageId}`);
    }
    if (!entry.shareToken) {
      entry.shareToken = `shr_${randomToken()}`;
      await writeJson(join(this.skillsRoot, "enabled.json"), data);
    }
    return {
      packageId,
      shareToken: entry.shareToken,
      sharePath: `/api/catalog/skills/share/${entry.shareToken}`,
    };
  }

  async getByShareToken(shareToken: string): Promise<{ meta: SkillPackageMeta; skillMd?: string } | undefined> {
    await this.ensure();
    const data = await this.readEnabled();
    const entry = data.enabled.find((e) => e.shareToken === shareToken);
    if (!entry) return undefined;
    return this.getDetail(entry.packageId);
  }

  /** Filter org list by member roles (S5). */
  async listOrgEnabledForRoles(roles: string[], q?: string): Promise<SkillPackageListItem[]> {
    const items = await this.listOrgEnabled(q);
    const roleSet = new Set(roles);
    return items.filter((item) => {
      const rolesAllowed = item.visibleToRoles;
      if (!rolesAllowed || rolesAllowed.length === 0) return true;
      return rolesAllowed.some((r) => roleSet.has(r));
    });
  }

  private async seedPublicRegistry(): Promise<void> {
    const seeds: Array<{ packageId: string; name: string; body: string }> = [
      {
        packageId: "omc-hello@1.0.0",
        name: "Hello Team",
        body: "# Hello Team\n\nA sample org skill package for OnMyCompany.\n",
      },
      {
        packageId: "omc-demo-search@0.1.0",
        name: "Demo Search",
        body: "# Demo Search\n\nPlaceholder skill for catalog UI.\n",
      },
      {
        packageId: "omc-demo-report@0.1.0",
        name: "Demo Report",
        body: "# Demo Report\n\nPlaceholder reporting skill.\n",
      },
    ];
    for (const seed of seeds) {
      const dir = join(this.skillsRoot, "registry", "public", safeDirName(seed.packageId));
      if (await exists(join(dir, "meta.json"))) continue;
      await mkdir(dir, { recursive: true });
      const meta: SkillPackageMeta = {
        packageId: seed.packageId,
        name: seed.name,
        visibility: "public",
        skillCount: 1,
        source: "seed",
        createdAt: new Date(0).toISOString(),
      };
      await writeJson(join(dir, "meta.json"), meta);
      await writeFile(join(dir, "SKILL.md"), seed.body, "utf8");
    }
  }

  private async scanRegistry(root: string): Promise<SkillPackageMeta[]> {
    if (!(await exists(root))) return [];
    const names = await readdir(root);
    const out: SkillPackageMeta[] = [];
    for (const name of names) {
      const meta = await readMeta(join(root, name));
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async readMetaByPackageId(packageId: string): Promise<SkillPackageMeta | undefined> {
    const dir = await this.resolvePackageDir(packageId);
    return dir ? readMeta(dir) : undefined;
  }

  private async resolvePackageDir(packageId: string): Promise<string | undefined> {
    const safe = safeDirName(packageId);
    const candidates = [join(this.skillsRoot, "registry", "public", safe), join(this.skillsRoot, "installed", safe)];
    // personal registries
    const personalRoot = join(this.skillsRoot, "registry", "personal");
    if (await exists(personalRoot)) {
      for (const member of await readdir(personalRoot)) {
        candidates.push(join(personalRoot, member, safe));
      }
    }
    for (const c of candidates) {
      if (await exists(join(c, "meta.json"))) return c;
    }
    return undefined;
  }

  private async readEnabled(): Promise<EnabledFile> {
    try {
      return JSON.parse(await readFile(join(this.skillsRoot, "enabled.json"), "utf8")) as EnabledFile;
    } catch {
      return { enabled: [] };
    }
  }
}

export class SkillsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function filterAndMark(items: SkillPackageMeta[], enabled: Set<string>, q?: string): SkillPackageListItem[] {
  return items.filter((m) => !q || matchesQuery(m, q)).map((m) => ({ ...m, added: enabled.has(m.packageId) }));
}

function matchesQuery(meta: SkillPackageMeta, q: string): boolean {
  const s = q.trim().toLowerCase();
  return meta.name.toLowerCase().includes(s) || meta.packageId.toLowerCase().includes(s);
}

function normalizePackageId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, "-");
}

function safeDirName(packageId: string): string {
  return packageId.replace(/[^a-zA-Z0-9@._+-]+/g, "_");
}

function relativeToSkills(skillsRoot: string, dir: string): string {
  return dir.slice(skillsRoot.length + 1).replace(/\\/g, "/");
}

async function readMeta(dir: string): Promise<SkillPackageMeta | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as SkillPackageMeta;
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, body: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyPackage(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    const src = join(from, name);
    const dest = join(to, name);
    const data = await readFile(src);
    await writeFile(dest, data);
  }
}

function randomToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
