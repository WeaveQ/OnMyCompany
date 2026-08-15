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
import { ConsoleModal, InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  version?: string;
}

export function ExpertsPage(): ReactNode {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [items, setItems] = useState<ExpertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(DEV_MEMBER_EMAIL);
  const [code, setCode] = useState(DEV_MEMBER_OTP);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
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
      const list = await apiGet<{ items: ExpertItem[] }>("/api/catalog/experts?scope=org", memberAuthHeaders());
      setItems(list.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        const ok = await ensureMemberSessionForConsole();
        if (ok) {
          try {
            const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
            setMe(meBody);
            if (meBody.authenticated) {
              const list = await apiGet<{ items: ExpertItem[] }>("/api/catalog/experts?scope=org", memberAuthHeaders());
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

  async function removeFromOrg(packageId: string): Promise<void> {
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
          <p className="page-hero-lead">Org persona packs for desktop agents.</p>
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
          <p className="page-hero-lead">Org persona packs for desktop agents.</p>
        </header>
        <MemberLoginCard
          title="Sign in to manage experts"
          description="Org-admin can add, upload, or remove packages."
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
          {isAdmin ? (
            <Button size="sm" onClick={() => setModalOpen(true)} data-testid="experts-add">
              + Add
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {toast ? <p className="page-toast">{toast}</p> : null}

      <section className="console-card skills-list-card">
        {items.length === 0 ? (
          <div className="console-empty">
            No org experts yet.
            {isAdmin ? " Add from the catalog or upload a Markdown pack." : " Ask an org-admin to add one."}
          </div>
        ) : (
          items.map((item) => (
            <ExpertRow
              key={item.packageId}
              item={item}
              isAdmin={isAdmin}
              onDetail={() => setDetailId(item.packageId)}
              onRemove={() => void removeFromOrg(item.packageId)}
            />
          ))
        )}
      </section>

      {modalOpen ? (
        <AddExpertModal onClose={() => setModalOpen(false)} onChanged={() => void refresh()} />
      ) : null}
      {detailId ? <ExpertDetailPanel packageId={detailId} onClose={() => setDetailId(null)} /> : null}
    </div>
  );
}

export function ExpertRow(props: {
  item: ExpertItem;
  isAdmin: boolean;
  onDetail(): void;
  onRemove(): void;
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
          <span className="skills-pill">org</span>
        </div>
        <div className="console-row-meta">
          {item.packageId}
          {item.description ? ` · ${item.description}` : ""}
        </div>
      </div>
      <div className="skills-row-actions">
        <Button variant="outline" size="sm" data-testid="expert-detail" onClick={props.onDetail}>
          Details
        </Button>
        {props.isAdmin ? (
          <Button variant="outline" size="sm" data-testid="expert-remove" onClick={props.onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AddExpertModal(props: { onClose(): void; onChanged(): void }): ReactNode {
  const [available, setAvailable] = useState<ExpertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadId, setUploadId] = useState("my-expert@0.1.0");
  const [uploadName, setUploadName] = useState("My expert");
  const [uploadMd, setUploadMd] = useState("# My expert\n\nPersona pack for desktop agents.\n");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<{ items: ExpertItem[] }>("/api/catalog/experts?scope=available", memberAuthHeaders());
      setAvailable(list.items.filter((item) => !item.installed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enable(packageId: string): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/experts/enable", { packageId }, memberAuthHeaders());
      await load();
      props.onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enable failed");
    }
  }

  async function upload(): Promise<void> {
    setError(null);
    try {
      await apiPost(
        "/api/org/experts/upload",
        { packageId: uploadId, name: uploadName, readme: uploadMd, enable: true },
        memberAuthHeaders(),
      );
      await load();
      props.onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  return (
    <ConsoleModal
      title="Add expert"
      description="Enable a catalog pack or upload Markdown. Desktop only — no company chat."
      onClose={props.onClose}
    >
      {error ? <InlineError message={error} /> : null}
      <div className="skills-upload-block">
        <strong className="skills-upload-title">Catalog</strong>
        {available.length === 0 ? (
          <div className="console-empty">{loading ? "Loading…" : "No unused catalog packs."}</div>
        ) : (
          available.map((item) => (
            <div key={item.packageId} className="skills-row skills-row-compact">
              <div className="skills-row-main">
                <div className="skills-row-title-line">
                  <strong>{item.name}</strong>
                </div>
                <div className="console-row-meta">
                  {item.packageId}
                  {item.description ? ` · ${item.description}` : ""}
                </div>
              </div>
              <Button size="sm" data-testid="expert-enable" onClick={() => void enable(item.packageId)}>
                Enable
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="skills-upload-block">
        <strong className="skills-upload-title">Upload Markdown</strong>
        <p className="console-row-meta skills-upload-desc">Writes to the org catalog and enables it.</p>
        <Input
          value={uploadId}
          onChange={(e) => setUploadId(e.target.value)}
          placeholder="packageId, e.g. sales-brief@1.1.0"
          data-testid="expert-upload-id"
        />
        <Input
          value={uploadName}
          onChange={(e) => setUploadName(e.target.value)}
          placeholder="Display name"
          data-testid="expert-upload-name"
        />
        <textarea
          className="org-config-json"
          value={uploadMd}
          onChange={(e) => setUploadMd(e.target.value)}
          rows={5}
          data-testid="expert-upload-md"
        />
        <Button size="sm" data-testid="expert-upload" onClick={() => void upload()}>
          Upload and enable
        </Button>
      </div>
    </ConsoleModal>
  );
}

export function ExpertDetailView(props: { name: string; packageId: string; readme?: string }): ReactNode {
  return (
    <div data-testid="expert-detail-body">
      <div className="console-row-meta">{props.packageId}</div>
      <pre className="org-config-json" data-testid="expert-detail-md">
        {props.readme || "(no README.md)"}
      </pre>
    </div>
  );
}

function ExpertDetailPanel(props: { packageId: string; onClose(): void }): ReactNode {
  const [readme, setReadme] = useState<string | undefined>();
  const [name, setName] = useState(props.packageId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await apiGet<{ item: ExpertItem; readme?: string }>(
          `/api/catalog/experts/${encodeURIComponent(props.packageId)}`,
          memberAuthHeaders(),
        );
        if (cancelled) return;
        setName(body.item.name);
        setReadme(body.readme);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load expert");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.packageId]);

  return (
    <ConsoleModal title={name} description="Persona pack body. No company chat." onClose={props.onClose}>
      {error ? <InlineError message={error} /> : null}
      <ExpertDetailView name={name} packageId={props.packageId} readme={readme} />
    </ConsoleModal>
  );
}
