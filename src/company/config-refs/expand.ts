const REF_RE = /@config:([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/g;

const SECRET_FIELDS = new Set([
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "clientsecret",
  "client_secret",
  "authorization",
]);

export const CONFIG_REF_REDACTED = "[redacted]";

export type ConfigAliases = Record<string, Record<string, unknown>>;

export function isSecretConfigField(field: string): boolean {
  return SECRET_FIELDS.has(field.trim().toLowerCase());
}

/** Expand `@config:ALIAS/field` in text. Secret fields never become plaintext. */
export function expandConfigText(text: string, aliases: ConfigAliases): string {
  return text.replace(REF_RE, (match, alias: string, field: string | undefined) => {
    const key = field || "value";
    if (isSecretConfigField(key)) return CONFIG_REF_REDACTED;
    const rec = aliases[alias];
    if (!rec || rec[key] === undefined || rec[key] === null) return match;
    const value = rec[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return match;
  });
}

export function expandConfigValue(value: unknown, aliases: ConfigAliases): unknown {
  if (typeof value === "string") return expandConfigText(value, aliases);
  if (Array.isArray(value)) return value.map((item) => expandConfigValue(item, aliases));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = expandConfigValue(v, aliases);
    }
    return out;
  }
  return value;
}

/** Alias listing for the console: field names only, never secret values. */
export function publicAliasIndex(aliases: ConfigAliases): Array<{ alias: string; fields: string[] }> {
  return Object.entries(aliases)
    .map(([alias, rec]) => ({
      alias,
      fields: Object.keys(rec).filter((f) => !isSecretConfigField(f)),
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

export function asConfigAliases(value: unknown): ConfigAliases {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ConfigAliases = {};
  for (const [alias, rec] of Object.entries(value as Record<string, unknown>)) {
    if (rec && typeof rec === "object" && !Array.isArray(rec)) {
      out[alias] = { ...(rec as Record<string, unknown>) };
    }
  }
  return out;
}
