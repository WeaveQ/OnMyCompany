import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  path: string;
  data: Buffer;
}

/**
 * Minimal ZIP reader (STORE + DEFLATE). Enough for Skill packages with SKILL.md.
 * Rejects path traversal and oversized payloads.
 */
export function extractZipEntries(buffer: Buffer, options?: { maxBytes?: number; maxFiles?: number }): ZipEntry[] {
  const maxBytes = options?.maxBytes ?? 8 * 1024 * 1024;
  const maxFiles = options?.maxFiles ?? 200;
  if (buffer.byteLength > maxBytes) {
    throw new ZipError("validation_error", `zip exceeds ${maxBytes} bytes`);
  }
  const out: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) break; // central dir / EOCD
    if (sig !== 0x04034b50) {
      throw new ZipError("validation_error", "invalid zip local header");
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const uncompSize = buffer.readUInt32LE(offset + 22);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) {
      throw new ZipError("validation_error", "truncated zip entry");
    }
    const rawName = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const path = normalizeZipPath(rawName);
    if (path && !path.endsWith("/")) {
      const compressed = buffer.subarray(dataStart, dataEnd);
      let data: Buffer;
      if (compression === 0) {
        data = Buffer.from(compressed);
      } else if (compression === 8) {
        data = inflateRawSync(compressed);
      } else {
        throw new ZipError("validation_error", `unsupported compression method ${compression}`);
      }
      if (uncompSize > 0 && data.length !== uncompSize && data.length > maxBytes) {
        throw new ZipError("validation_error", "decompressed entry too large");
      }
      out.push({ path, data });
      if (out.length > maxFiles) {
        throw new ZipError("validation_error", `zip has more than ${maxFiles} files`);
      }
    }
    offset = dataEnd;
  }
  if (out.length === 0) {
    throw new ZipError("validation_error", "zip has no files");
  }
  return out;
}

export function findSkillMarkdown(entries: ZipEntry[]): { skillMd: string; packageHint?: string } {
  const skill = entries.find((e) => /(^|\/)SKILL\.md$/i.test(e.path));
  if (!skill) {
    throw new ZipError("validation_error", "zip must contain SKILL.md");
  }
  const packageHint = skill.path.includes("/")
    ? skill.path.split("/")[0]
    : undefined;
  return { skillMd: skill.data.toString("utf8"), packageHint };
}

export class ZipError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function normalizeZipPath(name: string): string {
  const cleaned = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) {
    return "";
  }
  return cleaned;
}
