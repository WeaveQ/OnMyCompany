import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Relative paths under org config root that must exist (dirs end with `/`). */
export const ORG_CONFIG_SECTION_DIRS = [
  "memory",
  "skills",
  "experts/installed",
  "experts/mine",
  "experts/available",
  "tools",
  "design",
] as const;

export interface OrgConfigLayoutResult {
  root: string;
  created: boolean;
  paths: string[];
}

export function defaultOrgConfigRoot(dataDir: string, orgId = "default"): string {
  return join(dataDir, "org", orgId, "config");
}

/**
 * Ensure the empty OrgConfig skeleton from CONFIG-SCHEMA exists.
 * Creates missing dirs and placeholder JSON files; does not overwrite existing files.
 */
export async function ensureOrgConfigLayout(configRoot: string): Promise<OrgConfigLayoutResult> {
  const createdMarkers: string[] = [];
  let created = false;

  if (!(await pathExists(configRoot))) {
    await mkdir(configRoot, { recursive: true });
    created = true;
    createdMarkers.push(configRoot);
  }

  for (const rel of ORG_CONFIG_SECTION_DIRS) {
    const dir = join(configRoot, rel);
    if (!(await pathExists(dir))) {
      await mkdir(dir, { recursive: true });
      created = true;
      createdMarkers.push(dir);
    }
  }

  const files: Array<{ rel: string; body: string }> = [
    {
      rel: "manifest.json",
      body: JSON.stringify(
        {
          version: "cfg-0",
          updatedAt: new Date(0).toISOString(),
          schemaVersion: 1,
          orgId: "default",
        },
        null,
        2,
      ),
    },
    {
      rel: "models.json",
      // Directory only — no secrets. Points chat at OmniRoute sidecar by default (B+D).
      body: JSON.stringify(
        {
          models: [
            {
              id: "company-default-chat",
              displayName: "企业默认（OmniRoute）",
              baseUrl: process.env.OMC_OMNIROUTE_V1?.trim() || "http://127.0.0.1:20128/v1",
              apiStyle: "openai",
              via: "omniroute-sidecar",
              note: "Chat → OmniRoute; tools stay on OMC Gateway. Keys live in OmniRoute only.",
            },
          ],
          modelRouter: {
            provider: "omniroute",
            baseUrl: process.env.OMC_OMNIROUTE_V1?.trim() || "http://127.0.0.1:20128/v1",
            dashboardUrl: process.env.OMC_OMNIROUTE_DASHBOARD_URL?.trim() || "http://127.0.0.1:20128/dashboard",
          },
        },
        null,
        2,
      ),
    },
    {
      rel: "policy.json",
      body: JSON.stringify(
        {
          egress: { mode: "local_ok", sensitiveKinds: [] },
          actions: { allow: ["*"], deny: [] },
          allowPersonalBYOK: true,
        },
        null,
        2,
      ),
    },
    {
      rel: "memory/settings.json",
      body: JSON.stringify({ enabled: true }, null, 2),
    },
    { rel: "tools/mcp.json", body: JSON.stringify({ servers: [] }, null, 2) },
    { rel: "tools/gateway.json", body: JSON.stringify({ services: [] }, null, 2) },
    { rel: "tools/aliases.json", body: JSON.stringify({ aliases: {} }, null, 2) },
  ];

  for (const file of files) {
    const path = join(configRoot, file.rel);
    if (!(await pathExists(path))) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${file.body}\n`, "utf8");
      created = true;
      createdMarkers.push(path);
    }
  }

  return { root: configRoot, created, paths: createdMarkers };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
