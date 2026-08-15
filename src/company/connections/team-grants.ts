import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultConnectionName } from "../../connection-service.ts";
import { JsonWriteQueue, writeJsonAtomic } from "../json-write-queue.ts";

export interface ConnectionTeamGrant {
  service: string;
  connectionName: string;
  teamIds: string[];
}

interface GrantFile {
  grants: Record<string, string[]>;
}

/**
 * Per-connection team allow-list (no secrets).
 * Missing key = unrestricted. Non-empty list = only those teams.
 */
export class ConnectionTeamGrantStore {
  private readonly filePath: string;
  private cache: GrantFile | undefined;
  private readonly writeQueue = new JsonWriteQueue();

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "connection-team-grants.json");
  }

  static key(service: string, connectionName?: string): string {
    return `${service}::${normalizeName(connectionName)}`;
  }

  async list(): Promise<ConnectionTeamGrant[]> {
    const data = await this.read();
    return Object.entries(data.grants).map(([key, teamIds]) => {
      const [service, connectionName = defaultConnectionName] = key.split("::");
      return { service: service || "", connectionName, teamIds: [...teamIds] };
    });
  }

  async getTeamIds(service: string, connectionName?: string): Promise<string[]> {
    const data = await this.read();
    return [...(data.grants[ConnectionTeamGrantStore.key(service, connectionName)] ?? [])];
  }

  async setTeamIds(
    service: string,
    connectionName: string | undefined,
    teamIds: string[],
  ): Promise<ConnectionTeamGrant> {
    return this.writeQueue.run(async () => {
      const data = await this.read();
      const name = normalizeName(connectionName);
      const key = ConnectionTeamGrantStore.key(service, name);
      const cleaned = uniqueIds(teamIds);
      if (cleaned.length === 0) {
        delete data.grants[key];
      } else {
        data.grants[key] = cleaned;
      }
      await this.write(data);
      return { service, connectionName: name, teamIds: cleaned };
    });
  }

  /**
   * No grant row → unrestricted (missing team header still allowed).
   * Non-empty grant list → team header required and must match.
   */
  async isTeamAllowed(
    service: string,
    connectionName: string | undefined,
    teamId: string | undefined,
  ): Promise<boolean> {
    const allowed = await this.getTeamIds(service, connectionName);
    if (allowed.length === 0) return true;
    if (!teamId?.trim()) return false;
    return allowed.includes(teamId.trim());
  }

  private async read(): Promise<GrantFile> {
    if (this.cache) {
      return { grants: { ...this.cache.grants } };
    }
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as GrantFile;
      this.cache = { grants: raw.grants && typeof raw.grants === "object" ? { ...raw.grants } : {} };
    } catch {
      this.cache = { grants: {} };
    }
    return { grants: { ...this.cache.grants } };
  }

  private async write(data: GrantFile): Promise<void> {
    await writeJsonAtomic(this.filePath, data);
    this.cache = { grants: { ...data.grants } };
  }
}

function normalizeName(connectionName?: string): string {
  const n = connectionName?.trim();
  return n && n.length > 0 ? n : defaultConnectionName;
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
