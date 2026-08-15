import type { ReactNode } from "react";

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
  const servers = Array.isArray(props.data.mcp?.servers) ? props.data.mcp.servers : [];
  const services = Array.isArray(props.data.gateway?.services) ? props.data.gateway.services : [];
  return (
    <div data-testid="tools-catalog">
      <section className="console-card">
        <h2 className="console-card-title">MCP declarations</h2>
        <p className="console-card-subtitle">Read from tools/mcp.json. This process does not spawn or npx servers.</p>
        {servers.length === 0 ? (
          <div className="console-empty">No MCP servers declared.</div>
        ) : (
          servers.map((server, i) => (
            <div key={String(server.name ?? i)} className="skills-row" data-testid="tools-mcp-row">
              <div className="skills-row-main">
                <strong>{String(server.name ?? `server-${i}`)}</strong>
                <div className="console-row-meta">{summarizeServer(server)}</div>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="console-card">
        <h2 className="console-card-title">Gateway projection</h2>
        <p className="console-card-subtitle">Read from tools/gateway.json. No connection secrets.</p>
        {services.length === 0 ? (
          <div className="console-empty">No gateway services projected.</div>
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
          <h2 className="console-card-title">Named config aliases</h2>
          <p className="console-card-subtitle">Field names only. Secret values are never listed.</p>
          {props.data.aliases.map((a) => (
            <div key={a.alias} className="console-row-meta">
              {a.alias}: {a.fields.join(", ") || "(none)"}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function ToolsPage(): ReactNode {
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
      setError(err instanceof ApiError ? err.message : "Failed to load tools");
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
          <h1 className="page-hero-title">Tools</h1>
          <p className="page-hero-lead">Declared MCP servers and gateway projection.</p>
        </header>
        <p className="console-row-meta">Loading…</p>
      </div>
    );
  }

  if (!me?.authenticated) {
    return (
      <div className="page-stack tools-page" data-testid="tools-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Tools</h1>
          <p className="page-hero-lead">Declared MCP servers and gateway projection.</p>
        </header>
        <MemberLoginCard
          title="Sign in to view tools"
          description="Declarations only. This console does not start MCP processes."
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
          <h1 className="page-hero-title">Tools</h1>
          <p className="page-hero-lead">Org MCP + gateway declarations · {me.displayName || me.email}</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          Refresh
        </Button>
      </header>
      {error ? <InlineError message={error} /> : null}
      {data ? <ToolsCatalogList data={data} /> : null}
    </div>
  );
}

function summarizeServer(server: Record<string, unknown>): string {
  const command = server.command ? String(server.command) : "";
  const url = server.url ? String(server.url) : "";
  return [command, url].filter(Boolean).join(" · ") || "declared";
}

function serviceKey(service: Record<string, unknown> | string, i: number): string {
  if (typeof service === "string") return service;
  return String(service.service ?? service.id ?? i);
}

function serviceLabel(service: Record<string, unknown> | string): string {
  if (typeof service === "string") return service;
  return String(service.service ?? service.id ?? service.name ?? "service");
}
