import type { ReactNode } from "react";

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
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
  roles?: string[];
}

export interface ExpertItem {
  packageId: string;
  name: string;
  description?: string;
  installed: boolean;
}

export function ExpertsPage(): ReactNode {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [items, setItems] = useState<ExpertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(DEV_MEMBER_EMAIL);
  const [code, setCode] = useState(DEV_MEMBER_OTP);
  const isAdmin = Boolean(me?.roles?.includes("admin"));

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!hasMemberSession()) {
        const ok = await ensureMemberSessionForConsole();
        if (!ok) {
          setMe({ authenticated: false });
          setItems([]);
          return;
        }
      }
      const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
      setMe(meBody);
      if (!meBody.authenticated) {
        setItems([]);
        return;
      }
      const list = await apiGet<{ items: ExpertItem[] }>("/api/catalog/experts?scope=available", memberAuthHeaders());
      setItems(list.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        const ok = await ensureMemberSessionForConsole();
        if (ok) {
          try {
            const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
            setMe(meBody);
            if (meBody.authenticated) {
              const list = await apiGet<{ items: ExpertItem[] }>(
                "/api/catalog/experts?scope=available",
                memberAuthHeaders(),
              );
              setItems(list.items);
              return;
            }
          } catch {
            /* fall through */
          }
        }
        setMe({ authenticated: false });
        setItems([]);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load experts");
      }
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
    } finally {
      setLoading(false);
    }
  }

  async function enable(packageId: string): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/experts/enable", { packageId }, memberAuthHeaders());
      await refresh();
      setToast("Expert enabled");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enable failed");
    }
  }

  async function disable(packageId: string): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/experts/disable", { packageId }, memberAuthHeaders());
      await refresh();
      setToast("Expert removed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    }
  }

  if (loading && !me?.authenticated) {
    return (
      <div className="page-stack experts-page" data-testid="experts-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Experts</h1>
          <p className="page-hero-lead">Persona packs for desktop agents. No company chat.</p>
        </header>
        <p className="console-row-meta">Loading…</p>
      </div>
    );
  }

  if (!me?.authenticated) {
    return (
      <div className="page-stack experts-page" data-testid="experts-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Experts</h1>
          <p className="page-hero-lead">Persona packs for desktop agents. No company chat.</p>
        </header>
        <MemberLoginCard
          title="Sign in to manage experts"
          description="Org-admin can enable or remove packages."
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
    <div className="page-stack experts-page" data-testid="experts-page">
      <header className="page-hero page-hero-row">
        <div>
          <h1 className="page-hero-title">Experts</h1>
          <p className="page-hero-lead">
            Org persona packs · {me.displayName || me.email}
            {!isAdmin ? " · read-only" : ""}
          </p>
        </div>
        <div className="page-hero-actions">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {toast ? <p className="page-toast">{toast}</p> : null}

      <section className="console-card">
        {items.length === 0 ? (
          <div className="console-empty">
            No expert packs. <Link to="/org-config">Enterprise settings</Link>
          </div>
        ) : (
          items.map((item) => (
            <ExpertRow key={item.packageId} item={item} isAdmin={isAdmin} onEnable={enable} onDisable={disable} />
          ))
        )}
      </section>
    </div>
  );
}

export function ExpertRow(props: {
  item: ExpertItem;
  isAdmin: boolean;
  onEnable(packageId: string): void;
  onDisable(packageId: string): void;
}): ReactNode {
  const { item } = props;
  return (
    <div className="skills-row" data-testid={`expert-row-${item.packageId}`}>
      <div className="skills-row-mark" aria-hidden>
        {item.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="skills-row-main">
        <div className="skills-row-title-line">
          <strong>{item.name}</strong>
          <span className="skills-pill">{item.installed ? "enabled" : "available"}</span>
        </div>
        <div className="console-row-meta">
          {item.packageId}
          {item.description ? ` · ${item.description}` : ""}
        </div>
      </div>
      {props.isAdmin ? (
        <div className="skills-row-actions">
          {item.installed ? (
            <Button
              variant="outline"
              size="sm"
              data-testid="expert-remove"
              onClick={() => props.onDisable(item.packageId)}
            >
              Remove
            </Button>
          ) : (
            <Button size="sm" data-testid="expert-enable" onClick={() => props.onEnable(item.packageId)}>
              Enable
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
