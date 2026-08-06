import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Serialize async work on a single chain so concurrent read-modify-write
 * callers cannot interleave (last-writer-wins wipe).
 */
export class JsonWriteQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    // Keep the chain alive even if a job fails.
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

/** Atomic-ish JSON write: temp file then rename into place. */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = join(dirname(filePath), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, filePath);
}
