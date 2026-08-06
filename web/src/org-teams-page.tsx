import type { TeamRecord } from "./team-ui";
import type { ReactNode } from "react";

import { Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, apiGet, apiPost } from "./api";
import { MemberLoginCard } from "./member-login-card";
import { ensureMemberSessionForConsole, hasMemberSession, memberAuthHeaders, setMemberToken } from "./member-session";
import { InlineError } from "./shared-ui";
import { CreateTeamModal, TeamAvatar } from "./team-manage-page";
import { formatTeamIdSnippet } from "./team-ui";
import { Button } from "@/components/ui/button";

/**
 * 团队列表（企业侧）：有哪些队、创建、进入本队成员页。
 * 不在此页管理企业账号生命周期。
 */
export function OrgTeamsPage(): ReactNode {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(hasMemberSession());
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("admin@company.internal");
  const [code, setCode] = useState("000000");
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
          setTeams([]);
          return;
        }
      }
      const me = await apiGet<{ roles?: string[] }>("/api/me", memberAuthHeaders());
      const elevated = Boolean(me.roles?.includes("admin") || me.roles?.includes("auditor"));
      setIsOrgAdmin(Boolean(me.roles?.includes("admin")));
      const list = await apiGet<{ items: TeamRecord[] }>(
        elevated ? "/api/teams?scope=all" : "/api/teams",
        memberAuthHeaders(),
      );
      setTeams(list.items ?? []);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAuthed(false);
      } else {
        setError(err instanceof ApiError ? err.message : "加载团队列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  if (!authed) {
    return (
      <div className="page-stack org-teams-page" data-testid="org-teams-page">
        <header className="page-hero">
          <h1 className="page-hero-title">团队</h1>
          <p className="page-hero-lead">企业管理「有哪些小团队」。队内成员请进入具体团队后管理。</p>
        </header>
        <MemberLoginCard
          title="登录后查看团队"
          description="本地：admin@company.internal / 000000。"
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
    <div className="page-stack org-teams-page" data-testid="org-teams-page">
      <header className="page-hero page-hero-row">
        <div>
          <h1 className="page-hero-title">团队</h1>
          <p className="page-hero-lead">
            企业下的小团队。点进某队管理<strong>队内成员</strong>；公司花名册见 <Link to="/members">企业账号</Link>
            。侧栏只保留「团队」一项，本页是全部团队视图。
          </p>
        </div>
        <div className="page-hero-actions">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            刷新
          </Button>
          {isOrgAdmin ? (
            <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="org-teams-create">
              <Plus size={14} /> 创建团队
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}

      <div className="console-card" style={{ overflowX: "auto" }}>
        <table className="team-manage-table" data-testid="org-teams-table">
          <thead>
            <tr>
              <th>团队</th>
              <th>ID</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="team-user-cell">
                    <TeamAvatar name={t.name} url={t.avatarUrl} size={32} />
                    <div className="team-user-text">
                      <div className="console-row-title">{t.name}</div>
                    </div>
                  </div>
                </td>
                <td className="console-row-meta mono">{formatTeamIdSnippet(t.id)}</td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`org-team-open-${t.id}`}
                    onClick={() => navigate(`/team?team=${encodeURIComponent(t.id)}`)}
                  >
                    <Users size={14} /> 管理成员
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {teams.length === 0 ? (
          <div className="console-empty">{loading ? "加载中…" : "暂无团队，点击「创建团队」"}</div>
        ) : null}
      </div>

      <p className="console-row-meta">
        共 {teams.length} 个团队 · 策略与模型见 <Link to="/org-config">企业设置</Link>
      </p>

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(team) => {
          setTeams((prev) => [...prev, team]);
          setCreateOpen(false);
          navigate(`/team?team=${encodeURIComponent(team.id)}`);
        }}
      />
    </div>
  );
}
