import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonWriteQueue, writeJsonAtomic } from "../json-write-queue.ts";

export type CompanyAuditEventType =
  | "login"
  | "logout"
  | "config.write"
  | "member.create"
  | "member.update"
  | "member.deactivate"
  | "member.reactivate"
  | "member.remove"
  | "policy.deny"
  | "token.create"
  | "token.revoke"
  | "connection.create"
  | "connection.delete"
  | "connection.disable"
  | "connection.enable"
  | "skills.enable"
  | "skills.disable"
  | "skills.visibility"
  | "audit.export"
  | string;

/** Surface that initiated the action (CodeBuddy「操作端」analog). */
export type AuditClient = "admin_console" | "desktop" | "api" | "mcp" | "unknown";

export type AuditResult = "ok" | "denied" | "error";

export interface CompanyAuditEvent {
  id: string;
  type: CompanyAuditEventType;
  at: string;
  actorMemberId?: string;
  actorEmail?: string;
  /** One-line human-readable summary for admin UI. */
  summary?: string;
  /** Client surface. */
  client?: AuditClient | string;
  /** Request IP when available (x-forwarded-for / x-real-ip). */
  ip?: string;
  result?: AuditResult;
  details?: Record<string, unknown>;
}

export interface AuditListFilter {
  type?: string;
  client?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  /** Raise for export paths (default page cap is 500). */
  maxLimit?: number;
}

interface EventsFile {
  events: CompanyAuditEvent[];
}

const MAX_EVENTS = 10_000;

/** Exact keys that must never appear in exported audit details. */
const SECRET_KEY_RE =
  /^(api[_-]?key|token|secret|password|passwd|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|credential|credentials|cookie|session)$/i;

/**
 * Correlation / identity fields that must survive sanitization (not secrets).
 * Matched case-insensitively against the full key.
 */
const SAFE_ID_KEY_RE =
  /^(tokenid|runtimetokenid|memberid|actormemberid|packageid|teamid|connectionid|sharetoken|id|name|service|connectionname|actionid|code|caller|provider|section|version|reason|kind|format|count|disabled|enabled|roles|visibletoroles|attempt|revokedruntimetokens)$/i;

/**
 * Append-only company audit events (A2 / C8): login, config writes, token, connections, etc.
 * Stored under data/company/audit-events.json (not secrets).
 * Concurrent appends are serialized via an in-process write queue.
 */
export class CompanyAuditEventStore {
  private readonly filePath: string;
  private cache: EventsFile | undefined;
  private readonly writeQueue = new JsonWriteQueue();
  private truncations = 0;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "company", "audit-events.json");
  }

  /** How many times the ring buffer dropped oldest events (process lifetime). */
  get truncationCount(): number {
    return this.truncations;
  }

  async append(input: {
    type: CompanyAuditEventType;
    actorMemberId?: string;
    actorEmail?: string;
    summary?: string;
    client?: AuditClient | string;
    ip?: string;
    result?: AuditResult;
    details?: Record<string, unknown>;
  }): Promise<CompanyAuditEvent> {
    return this.writeQueue.run(async () => {
      const data = await this.read();
      const sanitizedDetails = input.details ? sanitizeAuditDetails(input.details) : undefined;
      const event: CompanyAuditEvent = {
        id: `evt_${randomBytes(10).toString("hex")}`,
        type: input.type,
        at: new Date().toISOString(),
        actorMemberId: input.actorMemberId,
        actorEmail: input.actorEmail,
        summary: input.summary ?? defaultSummary(input.type, input.actorEmail, sanitizedDetails),
        client: input.client,
        ip: input.ip,
        result: input.result ?? "ok",
        details: sanitizedDetails,
      };
      data.events.push(event);
      if (data.events.length > MAX_EVENTS) {
        const dropped = data.events.length - MAX_EVENTS;
        data.events = data.events.slice(-MAX_EVENTS);
        this.truncations += 1;
        // Best-effort observability for operators (no secrets).
        console.warn(
          `[omc-audit] truncated ${dropped} oldest event(s); cap=${MAX_EVENTS} truncations=${this.truncations}`,
        );
      }
      await this.write(data);
      return event;
    });
  }

  /**
   * Newest-first page. `offset` is into the reversed (newest-first) stream.
   * Example: limit=50, offset=0 → latest 50; offset=50 → next older 50.
   */
  async list(input?: AuditListFilter): Promise<{
    items: CompanyAuditEvent[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    const data = await this.read();
    const filtered = filterAuditEvents(data.events, input ?? {});
    const newestFirst = filtered.slice().reverse();
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
  async listAll(input?: Omit<AuditListFilter, "offset" | "maxLimit">): Promise<CompanyAuditEvent[]> {
    const page = await this.list({
      ...input,
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
    await writeJsonAtomic(this.filePath, data);
    this.cache = { events: [...data.events] };
  }
}

export function filterAuditEvents(events: CompanyAuditEvent[], filter: AuditListFilter): CompanyAuditEvent[] {
  const fromMs = filter.from ? Date.parse(filter.from) : Number.NaN;
  const toMs = filter.to ? Date.parse(filter.to) : Number.NaN;
  const type = filter.type?.trim().toLowerCase();
  const client = filter.client?.trim().toLowerCase();
  const actor = filter.actor?.trim().toLowerCase();
  const q = filter.q?.trim().toLowerCase();

  return events.filter((e) => {
    const t = Date.parse(e.at);
    if (Number.isFinite(fromMs) && t < fromMs) return false;
    if (Number.isFinite(toMs) && t > toMs) return false;
    if (type) {
      const et = e.type.toLowerCase();
      // exact type or prefix (member → member.create)
      if (et !== type && !et.startsWith(`${type}.`)) return false;
    }
    if (client && String(e.client ?? "").toLowerCase() !== client) return false;
    if (actor) {
      const hay = `${e.actorEmail ?? ""} ${e.actorMemberId ?? ""}`.toLowerCase();
      if (!hay.includes(actor)) return false;
    }
    if (q) {
      const blob = [
        e.type,
        e.summary ?? "",
        e.actorEmail ?? "",
        e.actorMemberId ?? "",
        e.client ?? "",
        e.ip ?? "",
        e.details ? JSON.stringify(e.details) : "",
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function eventsToJsonl(events: CompanyAuditEvent[]): string {
  return events.map((e) => JSON.stringify(sanitizeEventForExport(e))).join("\n") + (events.length ? "\n" : "");
}

export function eventsToCsv(events: CompanyAuditEvent[]): string {
  const headers = ["id", "at", "type", "summary", "client", "ip", "actorEmail", "actorMemberId", "result", "details"];
  const lines = [headers.join(",")];
  for (const event of events) {
    const safe = sanitizeEventForExport(event);
    const row = {
      id: safe.id,
      at: safe.at,
      type: safe.type,
      summary: safe.summary ?? "",
      client: safe.client ?? "",
      ip: safe.ip ?? "",
      actorEmail: safe.actorEmail ?? "",
      actorMemberId: safe.actorMemberId ?? "",
      result: safe.result ?? "",
      details: safe.details ? JSON.stringify(safe.details) : "",
    };
    lines.push(headers.map((h) => csvCell(row[h as keyof typeof row])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function sanitizeEventForExport(event: CompanyAuditEvent): CompanyAuditEvent {
  return {
    ...event,
    details: event.details ? sanitizeAuditDetails(event.details) : undefined,
  };
}

export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (isSafeCorrelationKey(key)) {
      // Keep ids / non-secret correlation fields even if the name contains "token".
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = sanitizeAuditDetails(value as Record<string, unknown>);
      } else if (typeof value === "string" && isSecretShapedValue(value)) {
        out[key] = "[redacted]";
      } else {
        out[key] = value;
      }
      continue;
    }
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeAuditDetails(value as Record<string, unknown>);
      continue;
    }
    if (typeof value === "string" && looksLikeSecretString(key, value)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function isSafeCorrelationKey(key: string): boolean {
  return SAFE_ID_KEY_RE.test(key);
}

function isSecretShapedValue(value: string): boolean {
  // opaque runtime tokens / long secrets — never keep raw secret material
  return /^(omc_|oct_|sk-|ghp_|ghp_|github_pat_)/i.test(value) && value.length >= 16;
}

function looksLikeSecretString(key: string, value: string): boolean {
  // Exact secret keys already handled; here catch nested-ish names that are not safe ids.
  if (/^(.*[_-])?(secret|password|passwd|apikey|api_key|authorization|bearer)([_-].*)?$/i.test(key)) {
    return true;
  }
  if (isSecretShapedValue(value)) return true;
  return false;
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function defaultSummary(type: string, actorEmail?: string, details?: Record<string, unknown>): string {
  const who = actorEmail || "someone";
  switch (type) {
    case "login":
      return `${who} signed in`;
    case "logout":
      return `${who} signed out`;
    case "config.write":
      return `${who} updated config${details?.section ? ` (${String(details.section)})` : ""}`;
    case "member.create":
      return `${who} created member${details?.email ? ` ${String(details.email)}` : ""}`;
    case "member.update":
      return `${who} updated member${details?.email ? ` ${String(details.email)}` : ""}`;
    case "member.deactivate":
      return `${who} deactivated member${details?.email ? ` ${String(details.email)}` : ""}`;
    case "member.reactivate":
      return `${who} reactivated member${details?.email ? ` ${String(details.email)}` : ""}`;
    case "member.remove":
      return `${who} removed member${details?.email ? ` ${String(details.email)}` : ""}`;
    case "token.create":
      return `${who} minted a runtime token`;
    case "token.revoke":
      return `${who} revoked runtime token(s)`;
    case "connection.create":
      return `${who} configured connection ${details?.service ?? ""}/${details?.connectionName ?? "default"}`.trim();
    case "connection.delete":
      return `${who} disconnected ${details?.service ?? ""}/${details?.connectionName ?? "default"}`.trim();
    case "connection.disable":
      return `${who} disabled connection ${details?.service ?? ""}/${details?.connectionName ?? "default"}`.trim();
    case "connection.enable":
      return `${who} enabled connection ${details?.service ?? ""}/${details?.connectionName ?? "default"}`.trim();
    case "skills.enable":
      return `${who} enabled skill ${details?.packageId ?? ""}`.trim();
    case "skills.disable":
      return `${who} disabled skill ${details?.packageId ?? ""}`.trim();
    case "skills.visibility":
      return `${who} changed skill visibility ${details?.packageId ?? ""}`.trim();
    case "policy.deny":
      return `Policy denied action ${details?.actionId ?? ""}`.trim();
    case "audit.export":
      return `${who} exported audit ${details?.kind ?? "data"}`;
    default:
      return `${who} performed ${type}`;
  }
}

/** Resolve client surface from headers / query. */
export function resolveAuditClient(input: {
  headerClient?: string | null;
  userAgent?: string | null;
  pathHint?: string;
}): AuditClient {
  const explicit = (input.headerClient || "").trim().toLowerCase();
  if (explicit === "desktop" || explicit === "onmyagent") return "desktop";
  if (explicit === "admin_console" || explicit === "console" || explicit === "web") return "admin_console";
  if (explicit === "api") return "api";
  if (explicit === "mcp") return "mcp";
  const ua = (input.userAgent || "").toLowerCase();
  if (ua.includes("onmyagent") || ua.includes("electron")) return "desktop";
  if (input.pathHint?.includes("/mcp")) return "mcp";
  return "admin_console";
}

/** First public IP from common proxy headers. */
export function resolveClientIp(input: {
  xForwardedFor?: string | null;
  xRealIp?: string | null;
  cfConnectingIp?: string | null;
}): string | undefined {
  const forwarded = input.xForwardedFor?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = input.xRealIp?.trim();
  if (real) return real;
  const cf = input.cfConnectingIp?.trim();
  if (cf) return cf;
  return undefined;
}
