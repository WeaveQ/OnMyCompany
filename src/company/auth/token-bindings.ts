import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface BindingFile {
  bindings: Array<{ tokenId: string; memberId: string; boundAt: string }>;
}

/**
 * Maps runtime token ids → org members for audit attribution (M3b).
 * Always reloads from disk so multiple injectors / process paths never diverge.
 */
export class TokenMemberBindingStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "token-member-bindings.json");
  }

  async bind(tokenId: string, memberId: string): Promise<void> {
    const data = await this.read();
    data.bindings = data.bindings.filter((b) => b.tokenId !== tokenId);
    data.bindings.push({ tokenId, memberId, boundAt: new Date().toISOString() });
    await this.write(data);
  }

  async resolveMemberId(tokenId: string): Promise<string | undefined> {
    const data = await this.read();
    return data.bindings.find((b) => b.tokenId === tokenId)?.memberId;
  }

  async unbind(tokenId: string): Promise<void> {
    const data = await this.read();
    data.bindings = data.bindings.filter((b) => b.tokenId !== tokenId);
    await this.write(data);
  }

  /** All runtime token ids bound to a member (P5 logout revoke). */
  async listTokenIdsForMember(memberId: string): Promise<string[]> {
    const data = await this.read();
    return data.bindings.filter((b) => b.memberId === memberId).map((b) => b.tokenId);
  }

  async unbindAllForMember(memberId: string): Promise<number> {
    const data = await this.read();
    const before = data.bindings.length;
    data.bindings = data.bindings.filter((b) => b.memberId !== memberId);
    const removed = before - data.bindings.length;
    if (removed > 0) {
      await this.write(data);
    }
    return removed;
  }

  private async read(): Promise<BindingFile> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as BindingFile;
      return { bindings: Array.isArray(raw.bindings) ? [...raw.bindings] : [] };
    } catch {
      return { bindings: [] };
    }
  }

  private async write(data: BindingFile): Promise<void> {
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
