import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Per-member UserData bag (M7 MVP): arbitrary JSON under data/company/userdata/{memberId}.json
 */
export class UserDataStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(dataDir, "company", "userdata");
  }

  async get(memberId: string): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(this.pathFor(memberId), "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async put(memberId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    await mkdir(this.root, { recursive: true });
    const next = { ...body, updatedAt: new Date().toISOString() };
    await writeFile(this.pathFor(memberId), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  async merge(memberId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await this.get(memberId);
    return this.put(memberId, { ...current, ...patch });
  }

  private pathFor(memberId: string): string {
    const safe = memberId.replace(/[^a-zA-Z0-9._-]+/g, "_");
    return join(this.root, `${safe}.json`);
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
