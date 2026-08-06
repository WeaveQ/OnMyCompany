import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CompanyAuditEventType = "login" | "logout" | "config.write" | "member.create" | "policy.deny" | string;

export interface CompanyAuditEvent {
  id: string;
  type: CompanyAuditEventType;
  at: string;
  actorMemberId?: string;
  actorEmail?: string;
  details?: Record<string, unknown>;
}

interface EventsFile {
  events: CompanyAuditEvent[];
}

const MAX_EVENTS = 10_000;

/**
 * Append-only company audit events (A2 / C8): login, config writes, etc.
 * Stored under data/company/audit-events.json (not secrets).
 */
export class CompanyAuditEventStore {
  private readonly filePath: string;
  private cache: EventsFile | undefined;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "audit-events.json");
  }

  async append(input: {
    type: CompanyAuditEventType;
    actorMemberId?: string;
    actorEmail?: string;
    details?: Record<string, unknown>;
  }): Promise<CompanyAuditEvent> {
    const data = await this.read();
    const event: CompanyAuditEvent = {
      id: `evt_${randomBytes(10).toString("hex")}`,
      type: input.type,
      at: new Date().toISOString(),
      actorMemberId: input.actorMemberId,
      actorEmail: input.actorEmail,
      details: input.details,
    };
    data.events.push(event);
    if (data.events.length > MAX_EVENTS) {
      data.events = data.events.slice(-MAX_EVENTS);
    }
    await this.write(data);
    return event;
  }

  /**
   * Newest-first page. `offset` is into the reversed (newest-first) stream.
   * Example: limit=50, offset=0 → latest 50; offset=50 → next older 50.
   */
  async list(input?: {
    type?: string;
    limit?: number;
    offset?: number;
    /** Raise for export paths (default page cap is 500). */
    maxLimit?: number;
  }): Promise<{ items: CompanyAuditEvent[]; total: number; limit: number; offset: number; hasMore: boolean }> {
    const data = await this.read();
    let items = data.events;
    if (input?.type) {
      items = items.filter((e) => e.type === input.type);
    }
    // chronological file order → newest first for UI
    const newestFirst = items.slice().reverse();
    const total = newestFirst.length;
    const maxLimit = Math.min(Math.max(input?.maxLimit ?? 500, 1), MAX_EVENTS);
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), maxLimit);
    const offset = Math.min(Math.max(input?.offset ?? 0, 0), total);
    const page = newestFirst.slice(offset, offset + limit);
    return {
      items: page,
      total,
      limit,
      offset,
      hasMore: offset + page.length < total,
    };
  }

  /** Newest-first flat list for export (up to store max). */
  async listAll(input?: { type?: string; limit?: number }): Promise<CompanyAuditEvent[]> {
    const page = await this.list({
      type: input?.type,
      limit: input?.limit ?? MAX_EVENTS,
      offset: 0,
      maxLimit: MAX_EVENTS,
    });
    return page.items;
  }

  private async read(): Promise<EventsFile> {
    if (this.cache) {
      return { events: [...this.cache.events] };
    }
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as EventsFile;
      this.cache = { events: Array.isArray(raw.events) ? raw.events : [] };
    } catch {
      this.cache = { events: [] };
    }
    return { events: [...this.cache.events] };
  }

  private async write(data: EventsFile): Promise<void> {
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    this.cache = { events: [...data.events] };
  }
}

export function eventsToJsonl(events: CompanyAuditEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
}
