import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiPost } from "./api";
import { MemberLoginCard } from "./member-login-card";
import {
  DEV_MEMBER_EMAIL,
  DEV_MEMBER_OTP,
  ensureMemberSessionForConsole,
  hasMemberSession,
  memberAuthHeaders,
  setMemberToken,
} from "./member-session";
import { InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";

interface MeResponse {
  authenticated: boolean;
  displayName?: string | null;
  email?: string;
}

export interface ToolsProjection {
  mcp: { servers?: Array<Record<string, unknown>> };
  gateway: { services?: Array<Record<string, unknown> | string> };
  aliases: Array<{ alias: string; fields: string[] }>;
}

export function ToolsCatalogList(props: { data: ToolsProjection }): ReactNode {
  const t = useTranslate();
  const servers = Array.isArray(props.data.mcp?.servers) ? props.data.mcp.servers : [];
  const services = Array.isArray(props.data.gateway?.services) ? props.data.gateway.services : [];
  return (
    <div data-testid="tools-catalog">
      <section className="console-card">
        <h2 className="console-card-title">{t("toolsPage.mcpTitle")}</h2>
        <p className="console-card-subtitle">{t("toolsPage.mcpSubtitle")}</p>
        {servers.length === 0 ? (
          <div className="console-empty">{t("toolsPage.mcpEmpty")}</div>
        ) : (
          servers.map((server, i) => (
            <div key={String(server.name ?? i)} className="skills-row" data-testid="tools-mcp-row">
              <div className="skills-row-main">
                <strong>{String(server.name ?? `server-${i}`)}</strong>
                <div className="console-row-meta">{summarizeServer(server, t("toolsPage.declared"))}</div>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="console-card">
        <h2 className="console-card-title">{t("toolsPage.gatewayTitle")}</h2>
        <p className="console-card-subtitle">{t("toolsPage.gatewaySubtitle")}</p>
        {services.length === 0 ? (
          <div className="console-empty">{t("toolsPage.gatewayEmpty")}</div>
        ) : (
          services.map((service, i) => (
            <div key={serviceKey(service, i)} className="skills-row" data-testid="tools-gateway-row">
              <div className="skills-row-main">
                <strong>{serviceLabel(service)}</strong>
              </div>
            </div>
          ))
        )}
      </section>
      {props.data.aliases.length > 0 ? (
        <section className="console-card">
          <h2 className="console-card-title">{t("toolsPage.aliasesTitle")}</h2>
          <p className="console-card-subtitle">{t("toolsPage.aliasesSubtitle")}</p>
          {props.data.aliases.map((a) => (
            <div key={a.alias} className="console-row-meta">
              {a.alias}: {a.fields.join(", ") || t("toolsPage.aliasesNone")}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function ToolsPage(): ReactNode {
  const t = useTranslate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<ToolsProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(DEV_MEMBER_EMAIL);
  const [code, setCode] = useState(DEV_MEMBER_OTP);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!hasMemberSession()) {
        const ok = await ensureMemberSessionForConsole();
        if (!ok) {
          setMe({ authenticated: false });
          setData(null);
          return;
        }
      }
      const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
      setMe(meBody);
      if (!meBody.authenticated) {
        setData(null);
        return;
      }
      const tools = await apiGet<ToolsProjection>("/api/org/tools", memberAuthHeaders());
      setData(tools);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolsPage.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      await apiPost("/api/company/auth/email/start", { email });
      const verified = await apiPost<{ token: string }>("/api/company/auth/email/verify", { email, code });
      setMemberToken(verified.token);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      setLoading(false);
    }
  }

  if (loading && !me?.authenticated) {
    return (
      <div className="page-stack tools-page" data-testid="tools-page">
        <header className="page-hero">
          <h1 className="page-hero-title">{t("toolsPage.title")}</h1>
          <p className="page-hero-lead">{t("toolsPage.lead")}</p>
        </header>
        <p className="console-row-meta">Loading…</p>
      </div>
    );
  }

  if (!me?.authenticated) {
    return (
      <div className="page-stack tools-page" data-testid="tools-page">
        <header className="page-hero">
          <h1 className="page-hero-title">{t("toolsPage.title")}</h1>
          <p className="page-hero-lead">{t("toolsPage.lead")}</p>
        </header>
        <MemberLoginCard
          title={t("toolsPage.loginTitle")}
          description={t("toolsPage.loginDesc")}
          email={email}
          code={code}
          loading={loading}
          error={error}
          onEmailChange={setEmail}
          onCodeChange={setCode}
          onSubmit={() => void login()}
        />
      </div>
    );
  }

  return (
    <div className="page-stack tools-page" data-testid="tools-page">
      <header className="page-hero page-hero-row">
        <div>
          <h1 className="page-hero-title">{t("toolsPage.title")}</h1>
          <p className="page-hero-lead">{t("toolsPage.leadWithUser", { user: me.displayName || me.email })}</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          {t("common.refresh")}
        </Button>
      </header>
      {error ? <InlineError message={error} /> : null}
      {data ? <ToolsCatalogList data={data} /> : null}
    </div>
  );
}

function summarizeServer(server: Record<string, unknown>, fallback: string): string {
  const command = server.command ? String(server.command) : "";
  const url = server.url ? String(server.url) : "";
  return [command, url].filter(Boolean).join(" · ") || fallback;
}

function serviceKey(service: Record<string, unknown> | string, i: number): string {
  if (typeof service === "string") return service;
  return String(service.service ?? service.id ?? i);
}

function serviceLabel(service: Record<string, unknown> | string): string {
  if (typeof service === "string") return service;
  return String(service.service ?? service.id ?? service.name ?? "service");
}
