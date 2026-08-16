import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asConfigAliases, expandConfigValue, publicAliasIndex } from "../config-refs/expand.ts";
import { ensureOrgConfigLayout } from "./layout.ts";

export type OrgConfigSection = "skills" | "experts" | "models" | "policy" | "tools" | "memory" | "manifest";

export interface OrgConfigManifest {
  version: string;
  updatedAt: string;
  schemaVersion: number;
  orgId?: string;
}

export interface OrgConfigSnapshot {
  version: string;
  updatedAt: string;
  orgId: string;
  config: Record<string, unknown>;
}

const JSON_SECTIONS = new Set(["models", "policy", "memory", "tools", "manifest"]);

export class OrgConfigStore {
  private readonly configRoot: string;
  private readonly orgId: string;

  constructor(configRoot: string, orgId = "default") {
    this.configRoot = configRoot;
    this.orgId = orgId;
  }

  async ensure(): Promise<void> {
    await ensureOrgConfigLayout(this.configRoot);
  }

  async getManifest(): Promise<OrgConfigManifest> {
    await this.ensure();
    return readJsonFile<OrgConfigManifest>(join(this.configRoot, "manifest.json"), {
      version: "cfg-0",
      updatedAt: new Date(0).toISOString(),
      schemaVersion: 1,
      orgId: this.orgId,
    });
  }

  async getSnapshot(): Promise<OrgConfigSnapshot> {
    await this.ensure();
    const manifest = await this.getManifest();
    const models = await readJsonFile(join(this.configRoot, "models.json"), { models: [] });
    const policy = await readJsonFile(join(this.configRoot, "policy.json"), {});
    const memory = await readJsonFile(join(this.configRoot, "memory", "settings.json"), { enabled: true });
    const aliases = await this.readAliases();
    const mcpRaw = await readJsonFile(join(this.configRoot, "tools", "mcp.json"), { servers: [] });
    const gatewayRaw = await readJsonFile(join(this.configRoot, "tools", "gateway.json"), { services: [] });
    const mcp = expandConfigValue(mcpRaw, aliases);
    const gateway = expandConfigValue(gatewayRaw, aliases);
    const skillsRoot = join(this.configRoot, "skills");
    const skillsInstalled = await listDirNames(join(skillsRoot, "installed"));
    const skillsEntries = await listDirNames(skillsRoot);
    const skillsEnabled = await readJsonFile(join(skillsRoot, "enabled.json"), { enabled: [] });
    const expertsInstalled = await listDirNames(join(this.configRoot, "experts", "installed"));
    const expertsMine = await listDirNames(join(this.configRoot, "experts", "mine"));

    return {
      version: manifest.version,
      updatedAt: manifest.updatedAt,
      orgId: this.orgId,
      config: {
        manifest,
        models,
        policy,
        memory: { settings: memory },
        tools: { mcp, gateway, aliases: publicAliasIndex(aliases) },
        skills: {
          entries: skillsEntries,
          installed: skillsInstalled,
          enabled: skillsEnabled,
        },
        experts: { installed: expertsInstalled, mine: expertsMine },
      },
    };
  }

  async putSection(section: string, body: unknown): Promise<OrgConfigManifest> {
    await this.ensure();
    const key = section as OrgConfigSection;
    if (key === "manifest") {
      throw new OrgConfigError("forbidden", "manifest is server-managed; update via section writes");
    }
    if (key === "skills" || key === "experts") {
      // MVP: accept JSON listing metadata only; packages stay on disk via scan later
      const path = join(this.configRoot, `${key}.meta.json`);
      await writeJsonFile(path, body);
    } else if (key === "models") {
      await writeJsonFile(join(this.configRoot, "models.json"), body);
    } else if (key === "policy") {
      await writeJsonFile(join(this.configRoot, "policy.json"), body);
    } else if (key === "memory") {
      const settings =
        typeof body === "object" && body !== null && "settings" in body
          ? (body as { settings: unknown }).settings
          : body;
      await writeJsonFile(join(this.configRoot, "memory", "settings.json"), settings);
    } else if (key === "tools") {
      const tools = body as { mcp?: unknown; gateway?: unknown; aliases?: unknown };
      if (tools.mcp !== undefined) {
        await writeJsonFile(join(this.configRoot, "tools", "mcp.json"), tools.mcp);
      }
      if (tools.gateway !== undefined) {
        await writeJsonFile(join(this.configRoot, "tools", "gateway.json"), tools.gateway);
      }
      if (tools.aliases !== undefined) {
        await writeJsonFile(join(this.configRoot, "tools", "aliases.json"), { aliases: tools.aliases });
      }
      if (tools.mcp === undefined && tools.gateway === undefined && tools.aliases === undefined) {
        throw new OrgConfigError("validation_error", "tools section requires mcp, gateway, and/or aliases");
      }
    } else {
      throw new OrgConfigError("not_found", `Unknown section: ${section}`);
    }
    return this.bumpManifest();
  }

  async getToolsProjection(): Promise<{
    mcp: unknown;
    gateway: unknown;
    aliases: Array<{ alias: string; fields: string[] }>;
  }> {
    const snap = await this.getSnapshot();
    const tools = (snap.config.tools ?? {}) as {
      mcp?: unknown;
      gateway?: unknown;
      aliases?: Array<{ alias: string; fields: string[] }>;
    };
    return {
      mcp: tools.mcp ?? { servers: [] },
      gateway: tools.gateway ?? { services: [] },
      aliases: tools.aliases ?? [],
    };
  }

  async readAliases(): Promise<ReturnType<typeof asConfigAliases>> {
    await this.ensure();
    const raw = await readJsonFile<Record<string, unknown>>(join(this.configRoot, "tools", "aliases.json"), {
      aliases: {},
    });
    const nested = raw.aliases;
    return asConfigAliases(nested && typeof nested === "object" ? nested : raw);
  }

  async getPolicy(): Promise<Record<string, unknown>> {
    await this.ensure();
    return readJsonFile(join(this.configRoot, "policy.json"), {});
  }

  /**
   * C5: Export org config sections without secrets (no encryption keys, connection secrets).
   */
  async exportBundle(): Promise<{
    orgId: string;
    version: string;
    updatedAt: string;
    exportedAt: string;
    sections: {
      models: unknown;
      policy: unknown;
      memory: unknown;
      tools: unknown;
    };
  }> {
    const snap = await this.getSnapshot();
    const cfg = snap.config;
    return {
      orgId: this.orgId,
      version: snap.version,
      updatedAt: snap.updatedAt,
      exportedAt: new Date().toISOString(),
      sections: {
        models: cfg.models ?? { models: [] },
        policy: cfg.policy ?? {},
        memory: cfg.memory ?? { settings: { enabled: true } },
        tools: cfg.tools ?? { mcp: { servers: [] }, gateway: { services: [] } },
      },
    };
  }

  /**
   * C5: Import section payloads (models/policy/memory/tools). Bumps manifest once at end.
   */
  async importBundle(body: {
    sections?: {
      models?: unknown;
      policy?: unknown;
      memory?: unknown;
      tools?: unknown;
    };
  }): Promise<OrgConfigManifest> {
    await this.ensure();
    const sections = body.sections ?? {};
    if (sections.models !== undefined) {
      await writeJsonFile(join(this.configRoot, "models.json"), sections.models);
    }
    if (sections.policy !== undefined) {
      await writeJsonFile(join(this.configRoot, "policy.json"), sections.policy);
    }
    if (sections.memory !== undefined) {
      const settings =
        typeof sections.memory === "object" && sections.memory !== null && "settings" in (sections.memory as object)
          ? (sections.memory as { settings: unknown }).settings
          : sections.memory;
      await writeJsonFile(join(this.configRoot, "memory", "settings.json"), settings);
    }
    if (sections.tools !== undefined) {
      const tools = sections.tools as { mcp?: unknown; gateway?: unknown };
      if (tools.mcp !== undefined) {
        await writeJsonFile(join(this.configRoot, "tools", "mcp.json"), tools.mcp);
      }
      if (tools.gateway !== undefined) {
        await writeJsonFile(join(this.configRoot, "tools", "gateway.json"), tools.gateway);
      }
    }
    return this.bumpManifest();
  }

  /** Public bump for directory-only writes (experts/installed). */
  async bump(): Promise<OrgConfigManifest> {
    await this.ensure();
    return this.bumpManifest();
  }

  private async bumpManifest(): Promise<OrgConfigManifest> {
    const current = await this.getManifest();
    const nextNum = Number(String(current.version).replace(/^cfg-/, "")) || 0;
    const next: OrgConfigManifest = {
      version: `cfg-${nextNum + 1}`,
      updatedAt: new Date().toISOString(),
      schemaVersion: current.schemaVersion ?? 1,
      orgId: this.orgId,
    };
    await writeJsonFile(join(this.configRoot, "manifest.json"), next);
    return next;
  }
}

export class OrgConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, body: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

async function listDirNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() || e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

export function isJsonSection(section: string): boolean {
  return JSON_SECTIONS.has(section);
}
