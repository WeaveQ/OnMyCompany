import type { ReactNode } from "react";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "./api";
import { MemberLoginCard } from "./member-login-card";
import {
  DEV_MEMBER_EMAIL,
  DEV_MEMBER_OTP,
  ensureMemberSessionForConsole,
  hasMemberSession,
  memberAuthHeaders,
  setMemberToken,
} from "./member-session";
import {
  accountStatusLabelZh,
  accountStatusTone,
  formatTeamIdSnippet,
  orgRoleHelpZh,
  orgRoleLabelZh,
  orgRolesLabelZh,
  type AccountLifecycle,
} from "./team-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeamAvatar } from "./team-manage-page";
import { ConsoleModal, InlineError } from "./shared-ui";

interface OrgMemberRow {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status?: string;
  statusLabel?: string;
}

const ORG_ROLE_OPTIONS = ["member", "admin", "auditor"] as const;

function normalizeAccountStatus(raw?: string): AccountLifecycle | string {
  if (raw === "pending" || raw === "未激活") return "pending";
  if (raw === "deactivated" || raw === "已停用" || raw === "已禁用") return "deactivated";
  return "active";
}

/**
 * 企业账号（公司花名册 SoT）。
 * 与「团队」分离：这里管企业角色与启停；队内成员在 /team。
 */
export function MembersPage(): ReactNode {
  const [items, setItems] = useState<OrgMemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(hasMemberSession());
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "deactivated">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgMemberRow | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgRole, setOrgRole] = useState<string>("member");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("member");
  const [editStatus, setEditStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [loginEmail, setLoginEmail] = useState(DEV_MEMBER_EMAIL);
  const [code, setCode] = useState(DEV_MEMBER_OTP);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!hasMemberSession()) {
        const ok = await ensureMemberSessionForConsole();
        if (!ok) {
          setAuthed(false);
          setItems([]);
          return;
        }
      }
      const me = await apiGet<{ authenticated?: boolean; roles?: string[] }>("/api/me", memberAuthHeaders());
      setIsOrgAdmin(Boolean(me.roles?.includes("admin")));
      const list = await apiGet<{ items: OrgMemberRow[] }>("/api/org/members", memberAuthHeaders());
      setItems(list.items ?? []);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // One more silent bootstrap (token expired)
        const ok = await ensureMemberSessionForConsole();
        if (ok) {
          try {
            const me = await apiGet<{ roles?: string[] }>("/api/me", memberAuthHeaders());
            setIsOrgAdmin(Boolean(me.roles?.includes("admin")));
            const list = await apiGet<{ items: OrgMemberRow[] }>("/api/org/members", memberAuthHeaders());
            setItems(list.items ?? []);
            setAuthed(true);
            return;
          } catch {
            /* fall through */
          }
        }
        setAuthed(false);
        setItems([]);
      } else {
        setError(err instanceof ApiError ? err.message : "加载成员失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return items.filter((m) => {
      const st = normalizeAccountStatus(m.status);
      if (filter === "all") return true;
      return st === filter;
    });
  }, [items, filter]);

  async function login(): Promise<void> {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await apiPost("/api/company/auth/email/start", { email: loginEmail.trim() });
      const verified = await apiPost<{ token: string }>("/api/company/auth/email/verify", {
        email: loginEmail.trim(),
        code: code.trim(),
      });
      if (!verified.token) throw new Error("无 token");
      setMemberToken(verified.token);
      setAuthed(true);
      await refresh();
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }

  async function addMember(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiPost(
        "/api/org/members",
        {
          email: email.trim(),
          roles: [orgRole],
          displayName: displayName.trim() || undefined,
        },
        memberAuthHeaders(),
      );
      setAddOpen(false);
      setEmail("");
      setDisplayName("");
      setOrgRole("member");
      setMessage("已添加成员（未激活，对方首次登录后启用）");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: OrgMemberRow): void {
    setEditTarget(row);
    setEditName(row.displayName || row.email.split("@")[0] || "");
    setEditRole((row.roles ?? ["member"])[0] || "member");
    const st = normalizeAccountStatus(row.status);
    setEditStatus(st === "deactivated" ? "deactivated" : "active");
    setEditOpen(true);
  }

  async function saveEdit(): Promise<void> {
    if (!editTarget) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        displayName: editName.trim() || editTarget.email.split("@")[0],
        roles: [editRole],
      };
      const cur = normalizeAccountStatus(editTarget.status);
      if (editStatus === "deactivated" && cur !== "deactivated") payload.status = "deactivated";
      if (editStatus === "active" && cur === "deactivated") payload.status = "active";
      await apiPut(`/api/org/members/${editTarget.id}`, payload, memberAuthHeaders());
      setEditOpen(false);
      setEditTarget(null);
      setMessage("已保存");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string): Promise<void> {
    setError(null);
    try {
      await apiPut(`/api/org/members/${id}`, { status: "deactivated" }, memberAuthHeaders());
      setMessage("已停用");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "停用失败");
    }
  }

  async function reactivate(id: string): Promise<void> {
    setError(null);
    try {
      await apiPut(`/api/org/members/${id}`, { status: "active" }, memberAuthHeaders());
      setMessage("已启用");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "启用失败");
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm("确定删除该账号？不可恢复。")) return;
    setError(null);
    try {
      await apiDelete(`/api/org/members/${id}`, memberAuthHeaders());
      setMessage("已删除");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  if (!authed) {
    return (
      <div className="page-stack members-page" data-testid="members-page">
        <header className="page-hero">
          <h1 className="page-hero-title">企业账号</h1>
          <p className="page-hero-lead">公司花名册：企业角色与启用/停用。小团队入队请到团队页。</p>
        </header>
        <MemberLoginCard
          title="登录后管理成员"
          description="需要企业成员会话。本地：admin@company.internal / 000000。"
          email={loginEmail}
          code={code}
          loading={loginLoading}
          error={loginError}
          onEmailChange={setLoginEmail}
          onCodeChange={setCode}
          onSubmit={() => void login()}
        />
      </div>
    );
  }

  return (
    <div className="page-stack members-page" data-testid="members-page">
      <header className="page-hero page-hero-row">
        <div>
          <h1 className="page-hero-title">企业账号</h1>
          <p className="page-hero-lead">
            公司花名册与企业角色（企业管理员 / 企业审计 / 员工）。入队与建队见{" "}
            <Link to="/team">团队</Link>。
          </p>
        </div>
        <div className="page-hero-actions">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            刷新
          </Button>
          {isOrgAdmin ? (
            <Button size="sm" onClick={() => setAddOpen(true)} data-testid="members-add">
              <Plus size={14} /> 添加账号
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {message ? <p className="page-toast">{message}</p> : null}

      <div className="team-people-tabs" role="tablist" aria-label="成员筛选">
        {(
          [
            ["all", "全部"],
            ["pending", "未激活"],
            ["active", "已启用"],
            ["deactivated", "已停用"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={filter === id ? "team-people-tab is-active" : "team-people-tab"}
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="console-card" style={{ overflowX: "auto" }}>
        <table className="team-manage-table" data-testid="members-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>企业角色</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const st = normalizeAccountStatus(row.status);
              const tone = accountStatusTone(String(st));
              return (
                <tr key={row.id} data-status={st}>
                  <td>
                    <div className="team-user-cell">
                      <TeamAvatar name={row.displayName || row.email} size={32} />
                      <div className="team-user-text">
                        <div className="console-row-title">{row.email}</div>
                        <div className="console-row-meta">
                          {row.displayName && row.displayName !== row.email
                            ? row.displayName
                            : formatTeamIdSnippet(row.id)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="team-pill">{orgRolesLabelZh(row.roles)}</span>
                  </td>
                  <td>
                    <span className={`team-status-pill is-${tone === "ok" ? "ok" : tone === "warn" ? "warn" : "muted"}`}>
                      {row.statusLabel || accountStatusLabelZh(String(st))}
                    </span>
                  </td>
                  <td className="team-col-actions">
                    <div className="team-row-actions">
                      {isOrgAdmin ? (
                        <>
                          <button
                            type="button"
                            className="team-icon-btn is-text"
                            title="编辑"
                            data-testid={`member-edit-${row.id}`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil size={15} /> 编辑
                          </button>
                          {st === "deactivated" ? (
                            <button
                              type="button"
                              className="team-icon-btn is-text"
                              onClick={() => void reactivate(row.id)}
                            >
                              启用
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="team-icon-btn is-text"
                              onClick={() => void deactivate(row.id)}
                            >
                              停用
                            </button>
                          )}
                          <button
                            type="button"
                            className="team-icon-btn is-danger"
                            title="删除"
                            onClick={() => void remove(row.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <span className="console-row-meta">只读</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="console-empty">{loading ? "加载中…" : "暂无成员"}</div>
        ) : null}
      </div>

      <p className="console-row-meta">
        <Users size={14} style={{ verticalAlign: "middle" }} /> 共 {filtered.length} / {items.length}{" "}
        人 · 入队 / 建队请到 <Link to="/team">团队</Link>
      </p>

      {addOpen ? (
        <ConsoleModal
          title="添加企业账号"
          description="创建企业账号（默认未激活）。入队请到「团队」从账号池选择。"
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void addMember()} disabled={saving || !email.includes("@")}>
                添加
              </Button>
            </>
          }
        >
          <Label className="field">
            <span>邮箱</span>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus data-testid="members-add-email" />
          </Label>
          <Label className="field">
            <span>显示名</span>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Label>
          <Label className="field">
            <span>企业角色</span>
            <select className="console-modal-select" value={orgRole} onChange={(e) => setOrgRole(e.target.value)}>
              {ORG_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {orgRoleLabelZh(r)}
                </option>
              ))}
            </select>
            <span className="console-modal-hint" data-testid="members-add-role-help">
              {orgRoleHelpZh(orgRole)}
            </span>
          </Label>
        </ConsoleModal>
      ) : null}

      {editOpen && editTarget ? (
        <ConsoleModal
          title="编辑企业账号"
          description={editTarget.email}
          onClose={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
              >
                取消
              </Button>
              <Button onClick={() => void saveEdit()} disabled={saving || !editName.trim()} data-testid="members-edit-save">
                保存
              </Button>
            </>
          }
        >
          <Label className="field">
            <span>显示名</span>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          </Label>
          <Label className="field">
            <span>企业角色</span>
            <select className="console-modal-select" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              {ORG_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {orgRoleLabelZh(r)}
                </option>
              ))}
            </select>
            <span className="console-modal-hint" data-testid="members-edit-role-help">
              {orgRoleHelpZh(editRole)}
            </span>
          </Label>
          <Label className="field">
            <span>状态</span>
            <select
              className="console-modal-select"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              disabled={normalizeAccountStatus(editTarget.status) === "pending"}
            >
              <option value="active">已启用</option>
              <option value="deactivated">已停用</option>
            </select>
          </Label>
        </ConsoleModal>
      ) : null}
    </div>
  );
}
