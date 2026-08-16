import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ConsoleModal, InlineError } from "./shared-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MeResponse {
  authenticated: boolean;
  memberId?: string | null;
  displayName?: string | null;
  email?: string;
  roles?: string[];
}

interface SkillItem {
  packageId: string;
  name: string;
  visibility: string;
  skillCount: number;
  description?: string;
  added: boolean;
  source?: string;
  visibleToRoles?: string[];
}

export const SKILL_ROLE_OPTIONS = ["admin", "member", "auditor"] as const;

export function SkillsPage(): ReactNode {
  const t = useTranslate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [orgItems, setOrgItems] = useState<SkillItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<SkillItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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
          setOrgItems([]);
          return;
        }
      }
      const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
      setMe(meBody);
      if (!meBody.authenticated) {
        setOrgItems([]);
        return;
      }
      const list = await apiGet<{ items: SkillItem[] }>("/api/catalog/skills?scope=org", memberAuthHeaders());
      setOrgItems(list.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        const ok = await ensureMemberSessionForConsole();
        if (ok) {
          try {
            const meBody = await apiGet<MeResponse>("/api/me", memberAuthHeaders());
            setMe(meBody);
            if (meBody.authenticated) {
              const list = await apiGet<{ items: SkillItem[] }>("/api/catalog/skills?scope=org", memberAuthHeaders());
              setOrgItems(list.items);
              return;
            }
          } catch {
            /* fall through */
          }
        }
        setMe({ authenticated: false });
        setOrgItems([]);
      } else {
        setError(err instanceof ApiError ? err.message : "加载失败");
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
      setError(err instanceof ApiError ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeFromOrg(packageId: string): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/skills/disable", { packageId }, memberAuthHeaders());
      await refresh();
      setToast("已从组织移除");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "移除失败");
    }
  }

  async function sharePackage(packageId: string): Promise<void> {
    setError(null);
    try {
      const res = await apiPost<{ sharePath: string; shareToken: string }>(
        "/api/org/skills/share",
        { packageId },
        memberAuthHeaders(),
      );
      const url = `${window.location.origin}${res.sharePath}`;
      await navigator.clipboard.writeText(url);
      setToast("分享链接已复制到剪贴板");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "分享失败");
    }
  }

  async function saveRoles(packageId: string, visibleToRoles: string[]): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/skills/visibility", { packageId, visibleToRoles }, memberAuthHeaders());
      await refresh();
      setToast(t("skillsPage.rolesUpdated"));
      setRoleTarget(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("skillsPage.rolesFailed"));
    }
  }

  if (loading && !me?.authenticated) {
    return (
      <div className="page-stack skills-page" data-testid="skills-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Skills</h1>
          <p className="page-hero-lead">Org skill packages.</p>
        </header>
        <p className="console-row-meta">Loading…</p>
      </div>
    );
  }

  if (!me?.authenticated) {
    return (
      <div className="page-stack skills-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Skills</h1>
          <p className="page-hero-lead">组织关联的 Skill 包：给团队 Agent 用的能力说明与模板。</p>
        </header>
        <MemberLoginCard
          title="登录后管理 Skills"
          description="登录企业成员后可查看已关联的 Skill 包；org-admin 可添加/移除。"
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
    <div className="page-stack skills-page" data-testid="skills-page">
      <header className="page-hero page-hero-row">
        <div>
          <h1 className="page-hero-title">Skills</h1>
          <p className="page-hero-lead">
            组织已关联的 Skill 包 · {me.displayName || me.email}
            {!isAdmin ? " · 只读" : ""}
          </p>
        </div>
        <div className="page-hero-actions">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            刷新
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={() => setModalOpen(true)} data-testid="skills-add">
              + 添加
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {toast ? <p className="page-toast">{toast}</p> : null}

      <section className="console-card skills-list-card">
        {orgItems.length === 0 ? (
          <div className="console-empty">
            暂无组织 Skills。
            {isAdmin ? " 点击「添加」从公开货架关联，或上传 Markdown/zip。" : " 请联系 org-admin 添加。"}
            {" · "}
            <Link to="/org-config">企业设置</Link>
          </div>
        ) : (
          orgItems.map((item) => (
            <div key={item.packageId} className="skills-row">
              <div className="skills-row-mark" aria-hidden>
                {item.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="skills-row-main">
                <div className="skills-row-title-line">
                  <strong>{item.name}</strong>
                  <span className="skills-pill">组织</span>
                </div>
                <div className="console-row-meta">
                  {item.packageId} · {item.skillCount} Skills
                  {item.description ? ` · ${item.description}` : ""}
                </div>
              </div>
              <div className="skills-row-actions">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="skills-detail"
                  onClick={() => setDetailId(item.packageId)}
                >
                  {t("skillsPage.details")}
                </Button>
                {isAdmin ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => void sharePackage(item.packageId)}>
                      分享
                    </Button>
                    <Button variant="outline" size="sm" data-testid="skills-roles" onClick={() => setRoleTarget(item)}>
                      {t("skillsPage.roles")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void removeFromOrg(item.packageId)}>
                      移除
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      {modalOpen ? (
        <AddSkillModal onClose={() => setModalOpen(false)} onChanged={() => void refresh()} isAdmin={isAdmin} />
      ) : null}
      {detailId ? <SkillDetailPanel packageId={detailId} onClose={() => setDetailId(null)} /> : null}
      {roleTarget ? (
        <SkillRolePicker
          packageId={roleTarget.packageId}
          selected={roleTarget.visibleToRoles ?? []}
          onClose={() => setRoleTarget(null)}
          onSave={(roles) => void saveRoles(roleTarget.packageId, roles)}
        />
      ) : null}
    </div>
  );
}

function AddSkillModal(props: { onClose(): void; onChanged(): void; isAdmin: boolean }): ReactNode {
  const [tab, setTab] = useState<"public" | "mine">("public");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SkillItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadId, setUploadId] = useState("my-skill@0.1.0");
  const [uploadName, setUploadName] = useState("My Skill");
  const [uploadMd, setUploadMd] = useState("# My Skill\n\n从控制台上传到个人货架。\n");
  const [linkToOrg, setLinkToOrg] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scope = tab === "public" ? "public" : "mine";
      const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
      const list = await apiGet<{ items: SkillItem[] }>(`/api/catalog/skills?scope=${scope}${qs}`, memberAuthHeaders());
      setItems(list.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载目录失败");
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => items, [items]);

  async function add(packageId: string): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/org/skills/enable", { packageId }, memberAuthHeaders());
      await load();
      props.onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    }
  }

  async function upload(): Promise<void> {
    setError(null);
    try {
      await apiPost(
        "/api/org/skills/upload",
        {
          packageId: uploadId,
          name: uploadName,
          skillMarkdown: uploadMd,
          // Console uploads always land in personal shelf (not public catalog).
          scope: "personal",
          enable: linkToOrg,
        },
        memberAuthHeaders(),
      );
      setTab("mine");
      await load();
      props.onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "上传失败");
    }
  }

  async function uploadZip(file: File): Promise<void> {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      const zipBase64 = btoa(binary);
      await apiPost(
        "/api/org/skills/upload-zip",
        {
          zipBase64,
          packageId: uploadId.includes("@") ? uploadId : undefined,
          name: uploadName || undefined,
          scope: "personal",
          enable: linkToOrg,
        },
        memberAuthHeaders(),
      );
      setTab("mine");
      await load();
      props.onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zip 上传失败");
    }
  }

  return (
    <ConsoleModal
      title="添加 Skill 包"
      description="从公开货架或「我的」选择后关联组织；新建上传一律进个人货架。"
      size="lg"
      className="skills-modal"
      onClose={props.onClose}
      footer={
        <Button variant="outline" onClick={props.onClose}>
          关闭
        </Button>
      }
    >
      <div className="skills-modal-toolbar">
        <Button size="sm" variant={tab === "public" ? "default" : "outline"} onClick={() => setTab("public")}>
          公开
        </Button>
        <Button size="sm" variant={tab === "mine" ? "default" : "outline"} onClick={() => setTab("mine")}>
          我的
        </Button>
        <Input
          className="skills-modal-search"
          placeholder={tab === "mine" ? "搜索我的 Skills" : "搜索公开 Skills"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
          搜索
        </Button>
      </div>

      {error ? <InlineError message={error} /> : null}

      <div className="skills-modal-list">
        {filtered.map((item) => (
          <div key={item.packageId} className="skills-row skills-row-compact">
            <div className="skills-row-main">
              <div className="skills-row-title-line">
                <strong>{item.name}</strong>
                <span className="skills-pill">{item.visibility === "public" ? "公开" : "个人"}</span>
              </div>
              <div className="console-row-meta">
                {item.packageId} · {item.skillCount} Skills
              </div>
            </div>
            {item.added ? (
              <Button size="sm" variant="outline" disabled>
                已关联
              </Button>
            ) : (
              <Button size="sm" disabled={!props.isAdmin} onClick={() => void add(item.packageId)}>
                {tab === "mine" ? "关联组织" : "添加"}
              </Button>
            )}
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="console-empty">
            {loading
              ? "加载中…"
              : tab === "mine"
                ? "个人货架还没有 Skill。可在下方上传 Markdown / zip。"
                : "无匹配结果"}
          </div>
        ) : null}
      </div>

      {props.isAdmin ? (
        <div className="skills-upload-block">
          <div className="skills-upload-head">
            <strong className="skills-upload-title">上传到我的 Skills</strong>
            <p className="console-row-meta skills-upload-desc">
              新建包先进入个人货架，不进公开目录。需要给团队用再勾选关联组织。
            </p>
          </div>
          <Input
            value={uploadId}
            onChange={(e) => setUploadId(e.target.value)}
            placeholder="packageId，如 my-skill@0.1.0"
          />
          <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="显示名称" />
          <textarea
            className="org-config-json"
            value={uploadMd}
            onChange={(e) => setUploadMd(e.target.value)}
            rows={5}
          />
          <label className="skills-upload-check">
            <input type="checkbox" checked={linkToOrg} onChange={(e) => setLinkToOrg(e.target.checked)} />
            <span>同时关联到当前组织</span>
          </label>
          <Button size="sm" onClick={() => void upload()}>
            {linkToOrg ? "上传到我的并关联组织" : "上传到我的 Skills"}
          </Button>
          <strong className="skills-upload-title">或上传 zip（含 SKILL.md）</strong>
          <Input
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadZip(file);
            }}
          />
        </div>
      ) : null}
    </ConsoleModal>
  );
}

export function SkillRolePicker(props: {
  packageId: string;
  selected: string[];
  onClose(): void;
  onSave(roles: string[]): void;
}): ReactNode {
  const t = useTranslate();
  const [roles, setRoles] = useState<string[]>(props.selected);

  function toggle(role: string): void {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  return (
    <ConsoleModal
      title={t("skillsPage.rolesTitle")}
      description={t("skillsPage.rolesDesc")}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="outline" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button data-testid="skills-roles-save" onClick={() => props.onSave(roles)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div data-testid="skills-role-picker">
        {SKILL_ROLE_OPTIONS.map((role) => (
          <label key={role} className="skills-upload-check">
            <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />
            <span>{role}</span>
          </label>
        ))}
      </div>
    </ConsoleModal>
  );
}

export interface SkillDetailBody {
  meta: {
    packageId: string;
    name: string;
    version?: string;
    enabledBy?: string;
    enabledAt?: string;
    source?: string;
  };
  skillMd?: string;
}

export function SkillDetailView(props: { detail: SkillDetailBody }): ReactNode {
  const t = useTranslate();
  const { detail } = props;
  return (
    <div data-testid="skills-detail-body">
      <div className="console-row-meta">
        {detail.meta.packageId}
        {detail.meta.version ? ` · v${detail.meta.version}` : ""}
        {detail.meta.enabledBy ? ` · ${t("skillsPage.addedBy", { id: detail.meta.enabledBy })}` : ""}
        {detail.meta.source ? ` · ${detail.meta.source}` : ""}
      </div>
      <pre className="org-config-json" data-testid="skills-detail-md">
        {detail.skillMd || t("skillsPage.noSkillMd")}
      </pre>
    </div>
  );
}

function SkillDetailPanel(props: { packageId: string; onClose(): void }): ReactNode {
  const t = useTranslate();
  const [detail, setDetail] = useState<SkillDetailBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await apiGet<SkillDetailBody>(
          `/api/catalog/skills/${encodeURIComponent(props.packageId)}`,
          memberAuthHeaders(),
        );
        if (!cancelled) setDetail(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("skillsPage.detailFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.packageId]);

  return (
    <ConsoleModal
      title={detail?.meta.name || props.packageId}
      description={t("skillsPage.detailDesc")}
      onClose={props.onClose}
    >
      {error ? <InlineError message={error} /> : null}
      {detail ? <SkillDetailView detail={detail} /> : <p className="console-row-meta">{t("common.loading")}</p>}
    </ConsoleModal>
  );
}
