/**
 * Curated office / productivity provider surface for OnMyCompany console.
 * Full OpenConnector catalog is 1000+ apps; product default is this allowlist.
 *
 * Override:
 * - `OMC_CATALOG_PROFILE=full` → all catalog apps
 * - `OMC_ALLOWED_SERVICES=gmail,notion,...` or `*` → explicit list / full
 */

/** Service ids that match `catalog/apps/<id>.json` / `providers/<id>`. */
export const OFFICE_CATALOG_SERVICES = [
  // Google Workspace
  "gmail",
  "googlesheets",
  "googlecalendar",
  "googledrive",
  "googledocs",
  "googleslides",
  "googleforms",
  "googletasks",
  // Microsoft-ish
  "outlook",
  "one_drive",
  // Core collab
  "notion",
  "slack",
  "github",
  "dropbox",
  "zoom",
  "calendly",
  // CN office
  "feishu",
  "feishu_app_bot",
  "feishu_custom_bot",
  "wecom_bot",
  "dingtalk_bot",
  "tencent_docs",
  "qq_mail",
  "netease_mail",
  "bark",
  "aliyun_oss",
  "baidu_maps",
  "tencent_maps",
  // Project / issue
  "asana",
  "trello",
  "linear",
  "jira",
  "confluence",
  "clickup",
  "todoist",
  // Light office+
  "airtable",
  "figma",
  "hubspot",
  // Ready-to-use / no_auth public data (OOMOL-style「可直接使用」)
  "hackernews",
  "arxiv",
  "npm",
  "pubmed",
  "quickchart",
  "wttr_in",
  "ossinsight",
  // AI models / tools (common office + agent use)
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "deepseek",
  "mistral_ai",
  "cohere",
  "groqcloud",
  "together_ai",
  "perplexity",
  "huggingface",
  "x_ai",
  "minimax",
  "qianfan",
  "replicate",
  "stabilityai",
  "elevenlabs",
  "deepgram",
  "assemblyai",
  "fireflies",
  "otter_ai",
  "pinecone",
  "weaviate",
  "mem0",
  "tavily",
  "exa",
  "jina_ai",
] as const;

/**
 * Services treated as「文档」in the console even when catalog category is Productivity.
 * Aligns with OOMOL-style Documents filter.
 */
export const DOCUMENT_CATALOG_SERVICES = [
  "googledocs",
  "googledrive",
  "googleslides",
  "googleforms",
  "notion",
  "dropbox",
  "confluence",
  "one_drive",
  "tencent_docs",
  "googlephotos",
] as const;

export type CatalogProfile = "office" | "full";

/**
 * Resolve which provider services to keep in the loaded catalog.
 * Returns `null` when no filtering (full catalog).
 */
export function resolveAllowedCatalogServices(input: {
  profile?: string | null;
  allowedServicesEnv?: string | null;
}): Set<string> | null {
  const explicit = (input.allowedServicesEnv ?? "").trim();
  if (explicit === "*" || explicit.toLowerCase() === "all") {
    return null;
  }
  if (explicit) {
    const ids = explicit
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return new Set(ids);
  }

  const profile = (input.profile ?? "office").trim().toLowerCase();
  if (profile === "full" || profile === "all" || profile === "*") {
    return null;
  }
  // default office
  return new Set(OFFICE_CATALOG_SERVICES);
}

export function filterProvidersByServices<T extends { service: string }>(
  providers: T[],
  allowed: Set<string> | null,
): T[] {
  if (!allowed) return providers;
  return providers.filter((p) => allowed.has(p.service));
}
