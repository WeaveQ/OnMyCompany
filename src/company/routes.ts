import type { RunLog } from "../server/storage/runtime-store.ts";
import type { MemberRole } from "./auth/store.ts";
import type { TeamMemberRole } from "./teams/store.ts";
import type { Context, Hono } from "hono";

import { CompanyAuditEventStore, eventsToJsonl } from "./audit/events.ts";
import { runsToCsv, runsToJsonl, summarizeUsage } from "./audit/export.ts";
import { sendOtpEmail } from "./auth/mail.ts";
import {
  CompanyAuthStore,
  accountStatusLabelZh,
  memberCanLogin,
  memberIsOrgAdmin,
  memberStatus,
  normalizeEmail,
} from "./auth/store.ts";
import { TokenMemberBindingStore } from "./auth/token-bindings.ts";
import {
  clearMemberCookie,
  jsonError,
  mapError,
  publicMember,
  readJsonBody,
  readMemberToken,
  requireAuditReader,
  requireMember,
  setMemberCookie,
} from "./http.ts";
import { defaultOrgConfigRoot, ensureOrgConfigLayout } from "./org-config/layout.ts";
import { OrgConfigStore } from "./org-config/store.ts";
import { buildEffectivePolicy } from "./policy/effective.ts";
import { loadLocalPricingCatalog, resolvePricingCatalog } from "./pricing/omniroute-pricing.ts";
import { fetchOmnirouteLlmUsage } from "./pricing/omniroute-usage.ts";
import { SkillsStore } from "./skills/store.ts";
import { TeamsStore } from "./teams/store.ts";
import { UserDataStore } from "./userdata/store.ts";

export interface CompanyRouteOptions {
  dataDir: string;
  orgId?: string;
  orgConfigRoot?: string;
  productVersion?: string;
  /** First org-admin email when members list is empty. */
  bootstrapAdminEmail?: string;
  /** MVP fixed OTP (default 000000). */
  devOtp?: string;
  /** Called after org policy section is written (M3: sync runtime-policy). */
  onOrgPolicyWrite?: (policy: Record<string, unknown>) => Promise<void> | void;
  /**
   * Mint a runtime token for the member (M3b attribution).
   * Implemented by connect-app using RuntimeTokenService + binding store.
   */
  createMemberRuntimeToken?: (input: { name: string; memberId: string }) => Promise<{ token: string; tokenId: string }>;
  /**
   * P5: Revoke all runtime tokens bound to a member (logout / disable).
   * Returns number of tokens revoked.
   */
  revokeMemberRuntimeTokens?: (memberId: string) => Promise<number>;
  /**
   * Shared token↔member binding store (must be the same instance used by
   * createConnectApp for resolveRuntimeToken / revokeMemberRuntimeTokens).
   */
  tokenBindings?: TokenMemberBindingStore;
  /** Provide run logs for audit export / usage (M6a / M7). */
  listRuns?: (limit?: number) => Promise<RunLog[]>;
  /**
   * Local console ops-admin check (cookie / ADMIN_TOKEN).
   * When true, read-only audit endpoints skip member OTP.
   */
  isOpsAdmin?: (context: Context) => Promise<boolean>;
}

export interface CompanyHealthBody {
  ok: true;
  companyModule: true;
  orgId: string;
  orgConfigRoot: string;
  orgConfigReady: boolean;
  version?: string;
  /** OmniRoute (or other) model-plane sidecar — optional B+D integration. */
  modelRouter?: {
    enabled: boolean;
    provider: string;
    baseUrl: string;
    v1Url: string;
    dashboardUrl: string;
    ok: boolean | null;
    detail?: string;
  };
}

/**
 * Mount OnMyCompany product routes on the shared Hono app (same process as Gateway).
 */
export function registerCompanyRoutes(app: Hono, options: CompanyRouteOptions): void {
  const orgId = options.orgId ?? "default";
  const orgConfigRoot = options.orgConfigRoot ?? defaultOrgConfigRoot(options.dataDir, orgId);
  const authStore = new CompanyAuthStore(options.dataDir);
  const orgStore = new OrgConfigStore(orgConfigRoot, orgId);
  const skillsStore = new SkillsStore(orgConfigRoot, options.dataDir);
  // Prefer injected store so connect-app resolve/revoke share the same SoT (P5).
  const tokenBindings = options.tokenBindings ?? new TokenMemberBindingStore(options.dataDir);
  const userDataStore = new UserDataStore(options.dataDir);
  const teamsStore = new TeamsStore(options.dataDir);
  const auditEvents = new CompanyAuditEventStore(options.dataDir);
  const devOtp = options.devOtp?.trim() || process.env.OMC_DEV_OTP?.trim() || "000000";
  const bootstrapEmail = normalizeEmail(options.bootstrapAdminEmail ?? process.env.OMC_BOOTSTRAP_ADMIN_EMAIL ?? "");

  app.get("/api/company/health", async (context) => {
    const layout = await ensureOrgConfigLayout(orgConfigRoot);
    const body: CompanyHealthBody = {
      ok: true,
      companyModule: true,
      orgId,
      orgConfigRoot: layout.root,
      orgConfigReady: true,
      version: options.productVersion,
      modelRouter: await probeModelRouter(),
    };
    return context.json(body);
  });

  app.post("/api/company/auth/email/start", async (context) => {
    try {
      const body = await readJsonBody(context);
      const email = normalizeEmail(String(body.email ?? ""));
      if (!email || !email.includes("@")) {
        return jsonError(context, 400, "validation_error", "Valid email required");
      }
      // Prefer random OTP when SMTP configured; keep fixed dev OTP for local.
      const useSmtp = Boolean(process.env.OMC_SMTP_URL?.trim());
      const code = useSmtp ? String(Math.floor(100000 + Math.random() * 900000)) : devOtp;
      await authStore.saveOtp(email, code);
      const mail = await sendOtpEmail({ to: email, code, orgId });
      return context.json({
        ok: true,
        email,
        // Only expose code when SMTP not used (or explicitly OMC_EXPOSE_DEV_OTP=1)
        devCode: !mail.sent || process.env.OMC_EXPOSE_DEV_OTP === "1" ? code : undefined,
        mail,
        message: mail.sent ? "OTP sent via SMTP." : "Use devCode as OTP (SMTP not configured or send failed).",
      });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // M7: Feishu login stub (exchange code later; MVP accepts feishuOpenId mock)
  app.post("/api/company/auth/feishu/start", async (context) => {
    const redirectUri = context.req.query("redirect_uri") || "/";
    const appId = process.env.OMC_FEISHU_APP_ID?.trim() || "cli_mock";
    // Mock authorize URL for local wiring
    return context.json({
      ok: true,
      authorizeUrl: `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=omc`,
      mock: !process.env.OMC_FEISHU_APP_ID,
    });
  });

  app.post("/api/company/auth/feishu/verify", async (context) => {
    try {
      const body = await readJsonBody(context);
      const openId = String(body.openId ?? body.code ?? "").trim();
      if (!openId) {
        return jsonError(context, 400, "validation_error", "openId or code required");
      }
      const email = normalizeEmail(String(body.email ?? `${openId}@feishu.local`));
      let member = await authStore.findMemberByEmail(email);
      if (!member) {
        const members = await authStore.listMembers();
        if (members.length === 0) {
          member = await authStore.createMember({
            email,
            roles: ["admin"],
            displayName: String(body.displayName ?? openId),
          });
        } else if (body.autoProvision === true) {
          member = await authStore.createMember({
            email,
            roles: ["member"],
            displayName: String(body.displayName ?? openId),
          });
        } else {
          return jsonError(context, 403, "forbidden", "No Feishu-linked account; ask admin to add you");
        }
      }
      if (!memberCanLogin(member)) {
        return jsonError(context, 403, "forbidden", "Member account is deactivated");
      }
      const token = await authStore.createSession(member.id);
      setMemberCookie(context, token);
      const refreshed = (await authStore.findMemberById(member.id)) ?? member;
      await auditEvents.append({
        type: "login",
        actorMemberId: refreshed.id,
        actorEmail: refreshed.email,
        details: { provider: "feishu" },
      });
      return context.json({ ok: true, token, member: publicMember(refreshed), provider: "feishu" });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/company/auth/email/verify", async (context) => {
    try {
      const body = await readJsonBody(context);
      const email = normalizeEmail(String(body.email ?? ""));
      const code = String(body.code ?? "").trim();
      if (!email || !code) {
        return jsonError(context, 400, "validation_error", "email and code required");
      }
      const ok = (await authStore.consumeOtp(email, code)) || code === devOtp;
      if (!ok) {
        return jsonError(context, 401, "unauthorized", "Invalid or expired code");
      }

      let member = await authStore.findMemberByEmail(email);
      if (!member) {
        const members = await authStore.listMembers();
        if (members.length === 0) {
          if (!bootstrapEmail) {
            return jsonError(
              context,
              403,
              "bootstrap_required",
              "Set OMC_BOOTSTRAP_ADMIN_EMAIL and verify that email first",
            );
          }
          if (email !== bootstrapEmail) {
            return jsonError(context, 403, "forbidden", `First login must use bootstrap email ${bootstrapEmail}`);
          }
          member = await authStore.createMember({
            email,
            roles: ["admin"],
            displayName: String(body.displayName ?? "").trim() || undefined,
          });
        } else {
          return jsonError(context, 403, "forbidden", "No account; ask an org-admin to add you");
        }
      }

      if (!memberCanLogin(member)) {
        return jsonError(context, 403, "forbidden", "Member account is deactivated");
      }

      const token = await authStore.createSession(member.id);
      setMemberCookie(context, token);
      const refreshed = (await authStore.findMemberById(member.id)) ?? member;
      const defaultTeam = await teamsStore.ensureDefaultTeam({
        name: refreshed.displayName || refreshed.email.split("@")[0] || "default_team",
        createdBy: refreshed.id,
      });
      const teams = await teamsStore.listTeamsForMember(refreshed.id);
      await auditEvents.append({
        type: "login",
        actorMemberId: refreshed.id,
        actorEmail: refreshed.email,
        details: { provider: "email" },
      });
      return context.json({
        ok: true,
        token,
        member: publicMember(refreshed),
        teams,
        defaultTeamId: defaultTeam.id,
      });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/company/auth/logout", async (context) => {
    const token = readMemberToken(context);
    const member = await authStore.resolveSession(token);
    let revokedTokens = 0;
    if (member) {
      if (options.revokeMemberRuntimeTokens) {
        revokedTokens = await options.revokeMemberRuntimeTokens(member.id);
      } else {
        // Fallback: unbind only (token may still resolve until store revoke wired)
        revokedTokens = await tokenBindings.unbindAllForMember(member.id);
      }
      await auditEvents.append({
        type: "logout",
        actorMemberId: member.id,
        actorEmail: member.email,
        details: { revokedRuntimeTokens: revokedTokens },
      });
    }
    await authStore.revokeSession(token);
    clearMemberCookie(context);
    return context.json({ ok: true, revokedRuntimeTokens: revokedTokens });
  });

  app.get("/api/me", async (context) => {
    const member = await authStore.resolveSession(readMemberToken(context));
    if (!member) {
      return context.json({
        authenticated: false,
        memberId: null,
        displayName: null,
        roles: [],
        orgId,
        teams: [],
      });
    }
    await teamsStore.ensureDefaultTeam({
      name: member.displayName || member.email.split("@")[0] || "default_team",
      createdBy: member.id,
    });
    const teams = await teamsStore.listTeamsForMember(member.id);
    return context.json({
      authenticated: true,
      memberId: member.id,
      displayName: member.displayName,
      email: member.email,
      roles: member.roles,
      orgId,
      teams,
    });
  });

  app.get("/api/org/config/manifest", async (context) => {
    try {
      await requireMember(context, authStore);
      const manifest = await orgStore.getManifest();
      return context.json(manifest);
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/org/config", async (context) => {
    try {
      await requireMember(context, authStore);
      const snapshot = await orgStore.getSnapshot();
      return context.json(snapshot);
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.put("/api/org/config/:section", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const section = context.req.param("section");
      const body = await readJsonBody(context);
      const manifest = await orgStore.putSection(section, body);
      if (section === "policy" && options.onOrgPolicyWrite) {
        await options.onOrgPolicyWrite(body as Record<string, unknown>);
      }
      await auditEvents.append({
        type: "config.write",
        actorMemberId: member.id,
        actorEmail: member.email,
        details: { section, version: manifest.version },
      });
      return context.json({ ok: true, manifest });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── C5: OrgConfig export / import (no secrets) ─────────────────────────

  app.get("/api/org/config/export", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member) && !member.roles.includes("auditor")) {
        return jsonError(context, 403, "forbidden", "admin or auditor role required");
      }
      const bundle = await orgStore.exportBundle();
      return context.json(bundle);
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/config/import", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const sections =
        (body.sections as {
          models?: unknown;
          policy?: unknown;
          memory?: unknown;
          tools?: unknown;
        }) ?? body;
      const manifest = await orgStore.importBundle({ sections });
      if (sections.policy !== undefined && options.onOrgPolicyWrite) {
        await options.onOrgPolicyWrite(sections.policy as Record<string, unknown>);
      }
      await auditEvents.append({
        type: "config.write",
        actorMemberId: member.id,
        actorEmail: member.email,
        details: { section: "import", version: manifest.version },
      });
      return context.json({ ok: true, manifest });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/policy/effective", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const snapshot = await orgStore.getSnapshot();
      const policy = (snapshot.config.policy as Record<string, unknown>) ?? {};
      return context.json(
        buildEffectivePolicy({
          policy,
          version: snapshot.version,
          updatedAt: snapshot.updatedAt,
          member,
        }),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── Skills catalog & org association (S1–S3) ───────────────────────────

  app.get("/api/catalog/skills", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const scope = (context.req.query("scope") || "org").toLowerCase();
      const q = context.req.query("q") || undefined;
      await skillsStore.ensure();
      if (scope === "public") {
        return context.json({ items: await skillsStore.listPublic(q) });
      }
      if (scope === "mine") {
        return context.json({ items: await skillsStore.listMine(member.id, q) });
      }
      // org = enabled for team, filtered by role (S5)
      return context.json({ items: await skillsStore.listOrgEnabledForRoles(member.roles, q) });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/catalog/skills/share/:shareToken", async (context) => {
    try {
      const shareToken = context.req.param("shareToken");
      const detail = await skillsStore.getByShareToken(shareToken);
      if (!detail) {
        return jsonError(context, 404, "not_found", "Share link invalid or expired");
      }
      return context.json({ ...detail, shared: true });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/catalog/skills/:packageId", async (context) => {
    try {
      await requireMember(context, authStore);
      const packageId = decodeURIComponent(context.req.param("packageId"));
      const detail = await skillsStore.getDetail(packageId);
      if (!detail) {
        return jsonError(context, 404, "not_found", "Skill package not found");
      }
      return context.json(detail);
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/skills/enable", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const packageId = String(body.packageId ?? "").trim();
      if (!packageId) {
        return jsonError(context, 400, "validation_error", "packageId required");
      }
      const entry = await skillsStore.enable(packageId, member.id);
      return context.json({ ok: true, entry });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/skills/disable", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const packageId = String(body.packageId ?? "").trim();
      if (!packageId) {
        return jsonError(context, 400, "validation_error", "packageId required");
      }
      await skillsStore.disable(packageId);
      return context.json({ ok: true });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/skills/upload", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const packageId = String(body.packageId ?? "").trim();
      const name = String(body.name ?? "").trim();
      const skillMarkdown = String(body.skillMarkdown ?? body.skillMd ?? "").trim();
      const scope = body.scope === "personal" ? "personal" : "public";
      const enable = body.enable !== false;
      if (!packageId || !skillMarkdown) {
        return jsonError(context, 400, "validation_error", "packageId and skillMarkdown required");
      }
      const meta = await skillsStore.uploadPackage({
        packageId,
        name: name || packageId,
        skillMarkdown,
        scope,
        memberId: member.id,
        description: body.description ? String(body.description) : undefined,
      });
      let entry;
      if (enable) {
        entry = await skillsStore.enable(meta.packageId, member.id);
      }
      return context.json({ ok: true, meta, entry });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.delete("/api/org/skills/:packageId", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const packageId = decodeURIComponent(context.req.param("packageId"));
      await skillsStore.removePackage(packageId);
      return context.json({ ok: true });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── M3b: member-bound runtime token ───────────────────────────────────

  app.post("/api/company/runtime-tokens", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!options.createMemberRuntimeToken) {
        return jsonError(context, 501, "not_implemented", "Runtime token minting not configured");
      }
      const body = await readJsonBody(context);
      const name = String(body.name ?? "").trim() || `member-${member.email}`;
      const created = await options.createMemberRuntimeToken({ name, memberId: member.id });
      await tokenBindings.bind(created.tokenId, member.id);
      return context.json({
        ok: true,
        token: created.token,
        tokenId: created.tokenId,
        memberId: member.id,
      });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/company/runtime-tokens/bind", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const body = await readJsonBody(context);
      const tokenId = String(body.tokenId ?? "").trim();
      if (!tokenId) {
        return jsonError(context, 400, "validation_error", "tokenId required");
      }
      await tokenBindings.bind(tokenId, member.id);
      return context.json({ ok: true, tokenId, memberId: member.id });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── S3z: zip upload ────────────────────────────────────────────────────

  app.post("/api/org/skills/upload-zip", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const contentType = context.req.header("content-type") || "";
      let zipBuffer: Buffer | undefined;
      let packageId: string | undefined;
      let name: string | undefined;
      let scope: "public" | "personal" = "public";
      let enable = true;
      let description: string | undefined;

      if (contentType.includes("multipart/form-data")) {
        const form = await context.req.parseBody({ all: true });
        const file = form.file ?? form.zip;
        if (file && typeof file === "object" && "arrayBuffer" in file) {
          zipBuffer = Buffer.from(await (file as File).arrayBuffer());
        }
        packageId = form.packageId ? String(form.packageId) : undefined;
        name = form.name ? String(form.name) : undefined;
        scope = form.scope === "personal" ? "personal" : "public";
        enable = String(form.enable ?? "true") !== "false";
        description = form.description ? String(form.description) : undefined;
      } else {
        const body = await readJsonBody(context);
        const b64 = String(body.zipBase64 ?? body.base64 ?? "").trim();
        if (!b64) {
          return jsonError(context, 400, "validation_error", "zip file or zipBase64 required");
        }
        zipBuffer = Buffer.from(b64, "base64");
        packageId = body.packageId ? String(body.packageId) : undefined;
        name = body.name ? String(body.name) : undefined;
        scope = body.scope === "personal" ? "personal" : "public";
        enable = body.enable !== false;
        description = body.description ? String(body.description) : undefined;
      }

      if (!zipBuffer?.length) {
        return jsonError(context, 400, "validation_error", "empty zip");
      }
      // Basic malware guard: reject common executable extensions inside zip (scan after extract)
      const meta = await skillsStore.uploadZipPackage({
        zipBuffer,
        packageId,
        name,
        scope,
        memberId: member.id,
        description,
      });
      let entry;
      if (enable) {
        entry = await skillsStore.enable(meta.packageId, member.id);
      }
      return context.json({ ok: true, meta, entry });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── S5: visibility + share ─────────────────────────────────────────────

  app.post("/api/org/skills/visibility", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const packageId = String(body.packageId ?? "").trim();
      const roles = Array.isArray(body.visibleToRoles)
        ? body.visibleToRoles.map(String)
        : typeof body.visibleToRoles === "string"
          ? body.visibleToRoles
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      if (!packageId) {
        return jsonError(context, 400, "validation_error", "packageId required");
      }
      const entry = await skillsStore.setVisibility(packageId, roles);
      return context.json({ ok: true, entry });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/skills/share", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const packageId = String(body.packageId ?? "").trim();
      if (!packageId) {
        return jsonError(context, 400, "validation_error", "packageId required");
      }
      const share = await skillsStore.createShareToken(packageId);
      return context.json({ ok: true, ...share });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── M1b: members ───────────────────────────────────────────────────────

  app.get("/api/org/members", async (context) => {
    try {
      await requireMember(context, authStore);
      const members = await authStore.listMembers();
      return context.json({ items: members.map(publicMember) });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/org/members", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const body = await readJsonBody(context);
      const email = normalizeEmail(String(body.email ?? ""));
      if (!email || !email.includes("@")) {
        return jsonError(context, 400, "validation_error", "Valid email required");
      }
      const roles = parseRoles(body.roles) ?? ["member"];
      const member = await authStore.createMember({
        email,
        roles,
        displayName: body.displayName ? String(body.displayName) : undefined,
      });
      const teamId = body.teamId ? String(body.teamId) : undefined;
      if (teamId) {
        const admin = await teamsStore.isTeamAdmin(teamId, actor.id);
        if (!admin && !memberIsOrgAdmin(actor)) {
          return jsonError(context, 403, "forbidden", "team admin required");
        }
        await teamsStore.addMember({
          teamId,
          memberId: member.id,
          role: (roles[0] as TeamMemberRole) || "member",
        });
      }
      await auditEvents.append({
        type: "member.create",
        actorMemberId: actor.id,
        actorEmail: actor.email,
        details: { memberId: member.id, email: member.email, roles },
      });
      return context.json({ ok: true, member: publicMember(member) }, 201 as 201);
    } catch (error) {
      return mapError(context, error);
    }
  });

  /** Org-admin: change roles and/or activate|deactivate. */
  app.put("/api/org/members/:memberId", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const memberId = context.req.param("memberId");
      if (memberId === actor.id && context.req.query("allowSelf") !== "1") {
        // Self role demotion still allowed only if other admins exist (enforced in store).
      }
      const body = await readJsonBody(context);
      let member = await authStore.findMemberById(memberId);
      if (!member) {
        return jsonError(context, 404, "not_found", "Member not found");
      }

      const roles = parseRoles(body.roles);
      if (roles) {
        member = await authStore.updateMemberRoles(memberId, roles);
      }

      if (body.displayName !== undefined) {
        member = await authStore.updateMemberProfile(memberId, {
          displayName: String(body.displayName),
        });
      }

      const statusRaw = body.status !== undefined ? String(body.status) : undefined;
      if (statusRaw === "deactivated" || body.deactivate === true) {
        if (memberId === actor.id) {
          return jsonError(context, 403, "forbidden", "Cannot deactivate yourself");
        }
        member = await authStore.deactivateMember(memberId);
        await authStore.revokeAllSessionsForMember(memberId);
        let revokedTokens = 0;
        if (options.revokeMemberRuntimeTokens) {
          revokedTokens = await options.revokeMemberRuntimeTokens(memberId);
        } else {
          revokedTokens = await tokenBindings.unbindAllForMember(memberId);
        }
        await auditEvents.append({
          type: "member.deactivate",
          actorMemberId: actor.id,
          actorEmail: actor.email,
          details: { memberId, email: member.email, revokedRuntimeTokens: revokedTokens },
        });
        return context.json({
          ok: true,
          member: publicMember(member),
          revokedRuntimeTokens: revokedTokens,
        });
      }
      if (statusRaw === "active" || body.reactivate === true) {
        member = await authStore.reactivateMember(memberId);
        await auditEvents.append({
          type: "member.reactivate",
          actorMemberId: actor.id,
          actorEmail: actor.email,
          details: { memberId, email: member.email },
        });
        return context.json({ ok: true, member: publicMember(member) });
      }

      if (roles || body.displayName !== undefined) {
        await auditEvents.append({
          type: "member.update",
          actorMemberId: actor.id,
          actorEmail: actor.email,
          details: {
            memberId,
            email: member.email,
            roles: member.roles,
            displayName: member.displayName,
          },
        });
      }
      return context.json({ ok: true, member: publicMember(member) });
    } catch (error) {
      return mapError(context, error);
    }
  });

  /** Org-admin: hard-remove member (sessions + runtime tokens revoked). */
  app.delete("/api/org/members/:memberId", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "org-admin role required");
      }
      const memberId = context.req.param("memberId");
      if (memberId === actor.id) {
        return jsonError(context, 403, "forbidden", "Cannot remove yourself");
      }
      const existing = await authStore.findMemberById(memberId);
      if (!existing) {
        return jsonError(context, 404, "not_found", "Member not found");
      }
      await authStore.revokeAllSessionsForMember(memberId);
      let revokedTokens = 0;
      if (options.revokeMemberRuntimeTokens) {
        revokedTokens = await options.revokeMemberRuntimeTokens(memberId);
      } else {
        revokedTokens = await tokenBindings.unbindAllForMember(memberId);
      }
      await authStore.removeMember(memberId);
      await auditEvents.append({
        type: "member.remove",
        actorMemberId: actor.id,
        actorEmail: actor.email,
        details: { memberId, email: existing.email, revokedRuntimeTokens: revokedTokens },
      });
      return context.json({ ok: true, revokedRuntimeTokens: revokedTokens });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── Teams (团队) ───────────────────────────────────────────────────────

  app.get("/api/teams", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      await teamsStore.ensureDefaultTeam({
        name: member.displayName || member.email.split("@")[0] || "default_team",
        createdBy: member.id,
      });
      const scope = context.req.query("scope") || "mine";
      if (scope === "all" && (memberIsOrgAdmin(member) || member.roles.includes("auditor"))) {
        const items = await teamsStore.listAllTeams();
        return context.json({ items, scope: "all" });
      }
      const teams = await teamsStore.listTeamsForMember(member.id);
      return context.json({ items: teams, scope: "mine" });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/teams", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const body = await readJsonBody(context);
      const name = String(body.name ?? "").trim();
      const avatarUrl = body.avatarUrl ? String(body.avatarUrl) : undefined;
      const team = await teamsStore.createTeam({
        name,
        avatarUrl,
        createdBy: member.id,
      });
      return context.json({ ok: true, team }, 201 as 201);
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/teams/:teamId", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      const team = await teamsStore.getTeam(teamId);
      if (!team) return jsonError(context, 404, "not_found", "Team not found");
      const membership = await teamsStore.getMembership(teamId, member.id);
      if (!membership || membership.status !== "active") {
        return jsonError(context, 403, "forbidden", "Not a team member");
      }
      return context.json({ team, membership });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.put("/api/teams/:teamId", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      if (!(await teamsStore.isTeamAdmin(teamId, member.id)) && !memberIsOrgAdmin(member)) {
        return jsonError(context, 403, "forbidden", "team admin required");
      }
      const body = await readJsonBody(context);
      const team = await teamsStore.updateTeam(teamId, {
        name: body.name !== undefined ? String(body.name) : undefined,
        avatarUrl: body.avatarUrl !== undefined ? String(body.avatarUrl) : undefined,
      });
      return context.json({ ok: true, team });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/teams/:teamId/members", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      const membership = await teamsStore.getMembership(teamId, actor.id);
      if (!membership || membership.status !== "active") {
        return jsonError(context, 403, "forbidden", "Not a team member");
      }
      const rows = await teamsStore.listMemberships(teamId);
      const items = [];
      for (const row of rows) {
        const m = await authStore.findMemberById(row.memberId);
        if (!m) continue;
        const account = memberStatus(m);
        // Prefer account lifecycle for UI (未激活/已启用/已停用); membership disabled is rare.
        const statusLabel = row.status !== "active" ? "已禁用" : accountStatusLabelZh(account);
        items.push({
          ...publicMember(m),
          teamRole: row.role,
          accountStatus: account,
          status: statusLabel,
          connectionAccess: "默认可用",
          joinedAt: row.joinedAt,
          isCreator: row.role === "creator",
          inTeam: true,
        });
      }
      const team = await teamsStore.getTeam(teamId);
      return context.json({ team, items });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.post("/api/teams/:teamId/members", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      if (!(await teamsStore.isTeamAdmin(teamId, actor.id)) && !memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "team admin required");
      }
      const body = await readJsonBody(context);
      const email = normalizeEmail(String(body.email ?? ""));
      if (!email || !email.includes("@")) {
        return jsonError(context, 400, "validation_error", "Valid email required");
      }
      let target = await authStore.findMemberByEmail(email);
      let createdOrgAccount = false;
      if (!target) {
        target = await authStore.createMember({
          email,
          roles: ["member"],
          displayName: body.displayName ? String(body.displayName) : undefined,
        });
        createdOrgAccount = true;
        await auditEvents.append({
          type: "member.create",
          actorMemberId: actor.id,
          actorEmail: actor.email,
          details: { memberId: target.id, email: target.email, roles: ["member"], via: "team.add" },
        });
      }
      const role = (String(body.role ?? "member") as TeamMemberRole) || "member";
      const membership = await teamsStore.addMember({
        teamId,
        memberId: target.id,
        role: role === "creator" ? "admin" : role,
      });
      return context.json(
        {
          ok: true,
          member: publicMember(target),
          membership,
          createdOrgAccount,
        },
        201 as 201,
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.put("/api/teams/:teamId/members/:memberId", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      const memberId = context.req.param("memberId");
      if (!(await teamsStore.isTeamAdmin(teamId, actor.id)) && !memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "team admin required");
      }
      const body = await readJsonBody(context);
      const role = String(body.role ?? "") as TeamMemberRole;
      if (role !== "admin" && role !== "member" && role !== "auditor") {
        return jsonError(context, 400, "validation_error", "role must be admin, member, or auditor");
      }
      const membership = await teamsStore.updateMemberRole({ teamId, memberId, role });
      return context.json({ ok: true, membership });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.delete("/api/teams/:teamId/members/:memberId", async (context) => {
    try {
      const actor = await requireMember(context, authStore);
      const teamId = context.req.param("teamId");
      const memberId = context.req.param("memberId");
      if (!(await teamsStore.isTeamAdmin(teamId, actor.id)) && !memberIsOrgAdmin(actor)) {
        return jsonError(context, 403, "forbidden", "team admin required");
      }
      await teamsStore.removeMember({ teamId, memberId });
      return context.json({ ok: true });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── A2: company audit events (login / config.write / …) ────────────────

  app.get("/api/company/audit/events", async (context) => {
    try {
      await requireAuditReader(context, authStore, options.isOpsAdmin);
      const type = context.req.query("type") || undefined;
      const limit = Math.min(Number(context.req.query("limit") || 50) || 50, 500);
      const offset = Math.max(Number(context.req.query("offset") || 0) || 0, 0);
      const page = await auditEvents.list({ type, limit, offset });
      return context.json({
        items: page.items,
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.hasMore,
      });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── M6a: audit export (runs + optional events) ─────────────────────────

  app.get("/api/company/audit/export", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!memberIsOrgAdmin(member) && !member.roles.includes("auditor")) {
        return jsonError(context, 403, "forbidden", "admin or auditor role required");
      }
      const format = (context.req.query("format") || "jsonl").toLowerCase();
      const kind = (context.req.query("kind") || "runs").toLowerCase();
      if (kind === "events") {
        const limit = Math.min(Number(context.req.query("limit") || 5000) || 5000, 10_000);
        const all = await auditEvents.listAll({ limit });
        const body = eventsToJsonl(all);
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "content-disposition": `attachment; filename="audit-events.jsonl"`,
          },
        });
      }
      if (!options.listRuns) {
        return jsonError(context, 501, "not_implemented", "Run store not wired");
      }
      const limit = Math.min(Number(context.req.query("limit") || 5000) || 5000, 20_000);
      const runs = await options.listRuns(limit);
      if (format === "csv") {
        const body = runsToCsv(runs);
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="audit-runs.csv"`,
          },
        });
      }
      const body = runsToJsonl(runs);
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "content-disposition": `attachment; filename="audit-runs.jsonl"`,
        },
      });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── M7 / G2: usage + pricing + userdata ────────────────────────────────

  app.get("/api/company/usage", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const empty = summarizeUsage([], { appliedLimit: 0 });
      if (!options.listRuns) {
        return context.json(empty);
      }
      const limit = Math.min(Number(context.req.query("limit") || 5000) || 5000, 20_000);
      const from = context.req.query("from") || undefined;
      const to = context.req.query("to") || undefined;
      const service = context.req.query("service") || undefined;
      const teamId = context.req.query("teamId") || undefined;
      // Members only see their own runs unless org-admin / auditor.
      const scopeMember =
        memberIsOrgAdmin(member) || member.roles.includes("auditor")
          ? context.req.query("memberId") || undefined
          : member.id;
      const runs = await options.listRuns(limit);
      return context.json(
        summarizeUsage(runs, {
          from,
          to,
          service,
          teamId,
          memberId: scopeMember,
          appliedLimit: limit,
        }),
      );
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/company/pricing", async (context) => {
    try {
      await requireMember(context, authStore);
      // B: ?source=auto|omniroute|static — LLM from OmniRoute when possible; tools always local.
      const catalog = await resolvePricingCatalog({
        dataDir: options.dataDir,
        mode: context.req.query("source"),
        loadLocal: () => loadLocalPricingCatalog(options.dataDir),
      });
      return context.json(catalog);
    } catch (error) {
      return mapError(context, error);
    }
  });

  /**
   * LLM usage from OmniRoute sidecar (B). Separate from tool usage GET /api/company/usage.
   * Query: optional from/to (YYYY-MM-DD) forwarded when supported by the sidecar.
   */
  app.get("/api/company/usage/llm", async (context) => {
    try {
      await requireMember(context, authStore);
      const summary = await fetchOmnirouteLlmUsage({
        from: context.req.query("from") || undefined,
        to: context.req.query("to") || undefined,
      });
      return context.json(summary);
    } catch (error) {
      return mapError(context, error);
    }
  });

  /** G2 metering logs — member session (not ops-admin /api/runs). */
  app.get("/api/company/runs", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      if (!options.listRuns) {
        return context.json({ items: [], totalMatched: 0, scanned: 0 });
      }
      const limit = Math.min(Number(context.req.query("limit") || 50) || 50, 500);
      const from = context.req.query("from") || undefined;
      const to = context.req.query("to") || undefined;
      const service = context.req.query("service") || undefined;
      const okRaw = context.req.query("ok");
      const okFilter = okRaw === "true" ? true : okRaw === "false" ? false : undefined;
      const isElevated = memberIsOrgAdmin(member) || member.roles.includes("auditor");
      const memberFilter = isElevated ? context.req.query("memberId") || undefined : member.id;
      const teamId = context.req.query("teamId") || undefined;
      const fromMs = from ? Date.parse(from) : Number.NaN;
      const toMs = to ? Date.parse(to) : Number.NaN;
      // listRuns is recency+limit only; scan a wider window then filter.
      const scanLimit = Math.min(Math.max(limit * 20, 500), 20_000);
      const runs = await options.listRuns(scanLimit);
      const filtered = runs.filter((run) => {
        if (memberFilter && run.memberId !== memberFilter) return false;
        if (!isElevated && run.memberId !== member.id) return false;
        if (teamId && run.teamId !== teamId) return false;
        if (service && run.service !== service) return false;
        if (okFilter !== undefined && run.ok !== okFilter) return false;
        const t = Date.parse(run.startedAt);
        if (Number.isFinite(fromMs) && t < fromMs) return false;
        if (Number.isFinite(toMs) && t > toMs) return false;
        return true;
      });
      const items = filtered.slice(0, limit).map((run) => ({
        id: run.id,
        service: run.service,
        actionId: run.actionId,
        caller: run.caller,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: run.durationMs,
        ok: run.ok,
        memberId: run.memberId,
        connectionName: run.connectionName,
        connectionId: run.connectionId,
        attempt: run.attempt,
        fallback: run.fallback,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      }));
      return context.json({ items, totalMatched: filtered.length, scanned: runs.length });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.get("/api/me/userdata", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const data = await userDataStore.get(member.id);
      return context.json({ memberId: member.id, data });
    } catch (error) {
      return mapError(context, error);
    }
  });

  app.put("/api/me/userdata", async (context) => {
    try {
      const member = await requireMember(context, authStore);
      const body = await readJsonBody(context);
      const data = await userDataStore.merge(member.id, body);
      return context.json({ ok: true, memberId: member.id, data });
    } catch (error) {
      return mapError(context, error);
    }
  });

  // ── M4d helper: enterprise overview snapshot ───────────────────────────

  app.get("/api/company/overview", async (context) => {
    try {
      await requireMember(context, authStore);
      const manifest = await orgStore.getManifest();
      const snapshot = await orgStore.getSnapshot();
      const members = await authStore.listMembers();
      const orgSkills = await skillsStore.listOrgEnabled();
      let runs: RunLog[] = [];
      if (options.listRuns) {
        runs = await options.listRuns(200);
      }
      const failed = runs.filter((r) => !r.ok);
      const policyDenied = failed.filter(
        (r) => r.errorCode === "action_blocked" || r.errorCode === "action_not_allowed",
      );
      return context.json({
        orgId,
        configVersion: manifest.version,
        configUpdatedAt: manifest.updatedAt,
        memberCount: members.length,
        orgSkillCount: orgSkills.length,
        recentRunCount: runs.length,
        recentFailedCount: failed.length,
        recentPolicyDenyCount: policyDenied.length,
        recentPolicyDenies: policyDenied.slice(0, 10).map((r) => ({
          id: r.id,
          actionId: r.actionId,
          memberId: r.memberId,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          startedAt: r.startedAt,
        })),
        policy: snapshot.config.policy ?? {},
      });
    } catch (error) {
      return mapError(context, error);
    }
  });
}

function parseRoles(value: unknown): MemberRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(["admin", "member", "auditor"]);
  const roles = value.map(String).filter((r): r is MemberRole => allowed.has(r));
  return roles.length ? roles : undefined;
}

function modelRouterUrls(): {
  enabled: boolean;
  baseUrl: string;
  v1Url: string;
  dashboardUrl: string;
} {
  const base =
    process.env.OMC_OMNIROUTE_URL?.trim() || process.env.OMC_MODEL_ROUTER_URL?.trim() || "http://127.0.0.1:20128";
  const normalized = base.replace(/\/+$/, "");
  const v1 = process.env.OMC_OMNIROUTE_V1?.trim() || process.env.OMC_MODEL_ROUTER_V1?.trim() || `${normalized}/v1`;
  const dashboard =
    process.env.OMC_OMNIROUTE_DASHBOARD_URL?.trim() ||
    process.env.OMC_MODEL_ROUTER_DASHBOARD_URL?.trim() ||
    `${normalized}/dashboard`;
  const disabled =
    process.env.OMC_OMNIROUTE_ENABLED === "0" ||
    process.env.OMC_OMNIROUTE_ENABLED === "false" ||
    process.env.OMC_MODEL_ROUTER_ENABLED === "0";
  return { enabled: !disabled, baseUrl: normalized, v1Url: v1, dashboardUrl: dashboard };
}

/** Best-effort probe of OmniRoute sidecar (does not block company health.ok). */
async function probeModelRouter(): Promise<NonNullable<CompanyHealthBody["modelRouter"]>> {
  const urls = modelRouterUrls();
  if (!urls.enabled) {
    return {
      enabled: false,
      provider: "omniroute",
      baseUrl: urls.baseUrl,
      v1Url: urls.v1Url,
      dashboardUrl: urls.dashboardUrl,
      ok: null,
      detail: "disabled by env",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const res = await fetch(`${urls.v1Url.replace(/\/+$/, "")}/models`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    return {
      enabled: true,
      provider: "omniroute",
      baseUrl: urls.baseUrl,
      v1Url: urls.v1Url,
      dashboardUrl: urls.dashboardUrl,
      ok: res.ok,
      detail: res.ok ? "reachable" : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      enabled: true,
      provider: "omniroute",
      baseUrl: urls.baseUrl,
      v1Url: urls.v1Url,
      dashboardUrl: urls.dashboardUrl,
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}
