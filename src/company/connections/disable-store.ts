import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { defaultConnectionName } from "../../connection-service.ts";
import { JsonWriteQueue, writeJsonAtomic } from "../json-write-queue.ts";

export interface DisabledConnectionKey {
  service: string;
  connectionName: string;
}

interface DisableFile {
  disabled: Record<string, true>;
}

/**
 * Org-level connection enable/disable flags (no secrets).
 * Key format: `${service}::${connectionName}`.
 * Concurrent setDisabled calls are serialized via an in-process write queue.
 */
export class ConnectionDisableStore {
  private readonly filePath: string;
  private cache: DisableFile | undefined;
  private readonly writeQueue = new JsonWriteQueue();

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "connection-disabled.json");
  }

  static key(service: string, connectionName?: string): string {
    return `${service}::${normalizeName(connectionName)}`;
  }

  async isDisabled(service: string, connectionName?: string): Promise<boolean> {
    const data = await this.read();
    return data.disabled[ConnectionDisableStore.key(service, connectionName)] === true;
  }

  async setDisabled(
    service: string,
    connectionName: string | undefined,
    disabled: boolean,
  ): Promise<DisabledConnectionKey> {
    return this.writeQueue.run(async () => {
      const data = await this.read();
      const name = normalizeName(connectionName);
      const key = ConnectionDisableStore.key(service, name);
      if (disabled) {
        data.disabled[key] = true;
      } else {
        delete data.disabled[key];
      }
      await this.write(data);
      return { service, connectionName: name };
    });
  }

  async listDisabled(): Promise<DisabledConnectionKey[]> {
    const data = await this.read();
    return Object.keys(data.disabled).map((key) => {
      const [service, connectionName = defaultConnectionName] = key.split("::");
      return { service: service || "", connectionName };
    });
  }

  private async read(): Promise<DisableFile> {
    if (this.cache) {
      return { disabled: { ...this.cache.disabled } };
    }
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as DisableFile;
      this.cache = { disabled: raw.disabled && typeof raw.disabled === "object" ? raw.disabled : {} };
    } catch {
      this.cache = { disabled: {} };
    }
    return { disabled: { ...this.cache.disabled } };
  }

  private async write(data: DisableFile): Promise<void> {
    await writeJsonAtomic(this.filePath, data);
    this.cache = { disabled: { ...data.disabled } };
  }
}

function normalizeName(connectionName?: string): string {
  const n = connectionName?.trim();
  return n && n.length > 0 ? n : defaultConnectionName;
}
