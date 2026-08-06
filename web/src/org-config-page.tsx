import type { ReactNode } from "react";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiGet, apiPost, apiPut } from "./api";
import { MemberLoginCard } from "./member-login-card";
import {
  clearMemberToken,
  ensureMemberSessionForConsole,
  getMemberToken,
  memberAuthHeaders,
  setMemberToken,
} from "./member-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "./shared-ui";

interface MeResponse {
  authenticated: boolean;
  memberId?: string | null;
  displayName?: string | null;
  email?: string;
  roles?: string[];
  orgId?: string;
}

interface OrgSnapshot {
  version: string;
  updatedAt: string;
  orgId: string;
  config: {
    policy?: Record<string, unknown>;
    models?: { models?: unknown[] } | unknown;
    memory?: unknown;
    tools?: unknown;
    skills?: {
      entries?: string[];
      installed?: string[];
      enabled?: { enabled?: unknown[] };
    };
    experts?: { installed?: string[]; mine?: string[] };
  };
}

interface PolicyForm {
  allowedActions: string;
  blockedActions: string;
  allowPersonalBYOK: boolean;
  egressMode: string;
}

function policyToForm(policy: Record<string, unknown> | undefined): PolicyForm {
  const p = policy ?? {};
  const allowed = Array.isArray(p.allowedActions) ? (p.allowedActions as string[]) : ["*"];
  const blocked = Array.isArray(p.blockedActions) ? (p.blockedActions as string[]) : [];
  const egress =
    typeof p.egress === "object" && p.egress !== null
      ? String((p.egress as { mode?: string }).mode ?? "gateway_preferred")
      : "gateway_preferred";
  return {
    allowedActions: allowed.join(", "),
    blockedActions: blocked.join(", "),
    allowPersonalBYOK: p.allowPersonalBYOK !== false,
    egressMode: egress || "gateway_preferred",
  };
}

function formToPolicy(form: PolicyForm, previous: Record<string, unknown> | undefined): Record<string, unknown> {
  const split = (s: string) =>
    s
      .split(/[,，\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const prev = previous ?? {};
  const egressPrev =
    typeof prev.egress === "object" && prev.egress !== null ? (prev.egress as Record<string, unknown>) : {};
  return {
    ...prev,
    allowedActions: split(form.allowedActions),
    blockedActions: split(form.blockedActions),
    allowPersonalBYOK: form.allowPersonalBYOK,
    egress: {
      ...egressPrev,
      mode: form.egressMode,
    },
  };
}

function listNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

/**
 * Org config product page — human-first IA (not raw JSON console).
 */
export function OrgConfigPage(): ReactNode {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [snapshot, setSnapshot] = useState<OrgSnapshot | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(policyToForm({}));
  const [policyJson, setPolicyJson] = useState("");
  const [modelsJson, setModelsJson] = useState("");
  const [showAdvancedPolicy, setShowAdvancedPolicy] = useState(false);
  const [showAdvancedModels, setShowAdvancedModels] = useState(false);
  const [email, setEmail] = useState("admin@company.internal");
  const [code, setCode] = useState("000000");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | undefined>(() => getMemberToken());

  const authOpts = token ? memberAuthHeaders() : {};
  const isAdmin = Boolean(me?.roles?.includes("admin"));

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let tok = getMemberToken() || token;
      if (!tok) {
        const ok = await ensureMemberSessionForConsole();
        tok = getMemberToken();
        if (ok && tok) setToken(tok);
      }
      const opts = tok ? memberAuthHeaders() : {};
      const meBody = await apiGet<MeResponse>("/api/me", opts);
      setMe(meBody);
      if (!meBody.authenticated) {
        setSnapshot(null);
        return;
      }
      const snap = await apiGet<OrgSnapshot>("/api/org/config", opts);
      setSnapshot(snap);
      const policy = (snap.config.policy ?? {}) as Record<string, unknown>;
      setPolicyForm(policyToForm(policy));
      setPolicyJson(JSON.stringify(policy, null, 2));
      setModelsJson(JSON.stringify(snap.config.models ?? { models: [] }, null, 2));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载企业设置失败");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(): Promise<void> {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await apiPost("/api/company/auth/email/start", { email });
      const verified = await apiPost<{ token: string }>("/api/company/auth/email/verify", { email, code });
      setMemberToken(verified.token);
      setToken(verified.token);
      setMessage("登录成功");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiPost("/api/company/auth/logout", {}, authOpts);
    } catch {
      // ignore
    }
    clearMemberToken();
    setToken(undefined);
    setMe({ authenticated: false });
    setSnapshot(null);
    setMessage(null);
  }

  async function savePolicyFromForm(): Promise<void> {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const prev = (snapshot?.config.policy ?? {}) as Record<string, unknown>;
      const body = formToPolicy(policyForm, prev);
      await apiPut("/api/org/config/policy", body, authOpts);
      setMessage("策略已保存（并同步到网关运行策略）");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存策略失败");
    } finally {
      setLoading(false);
    }
  }

  async function savePolicyFromJson(): Promise<void> {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const body = JSON.parse(policyJson) as unknown;
      await apiPut("/api/org/config/policy", body, authOpts);
      setMessage("策略 JSON 已保存");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "JSON 无效或保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveModelsFromJson(): Promise<void> {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const body = JSON.parse(modelsJson) as unknown;
      await apiPut("/api/org/config/models", body, authOpts);
      setMessage("模型目录已保存");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "JSON 无效或保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function exportConfig(): Promise<void> {
    setError(null);
    try {
      const bundle = await apiGet<unknown>("/api/org/config/export", authOpts);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `org-config-${snapshot?.version ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("已导出配置（不含密钥）");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "导出失败");
    }
  }

  const skillNames = useMemo(() => {
    const s = snapshot?.config.skills;
    const installed = listNames(s?.installed);
    const entries = listNames(s?.entries).filter((n) => n !== "installed" && n !== "enabled.json");
    return { installed, entries };
  }, [snapshot]);

  const expertNames = useMemo(() => {
    const e = snapshot?.config.experts;
    return {
      installed: listNames(e?.installed),
      mine: listNames(e?.mine),
    };
  }, [snapshot]);

  const modelCount = useMemo(() => {
    const m = snapshot?.config.models;
    if (m && typeof m === "object" && Array.isArray((m as { models?: unknown[] }).models)) {
      return (m as { models: unknown[] }).models.length;
    }
    return 0;
  }, [snapshot]);

  return (
    <div className="page-stack org-config-page" data-testid="org-config-page">
      <header className="org-config-hero">
        <div>
          <h1 className="org-config-title">企业设置</h1>
          <p className="org-config-lead">
            这里管的是<strong>公司下发给所有 Agent 的统一配置</strong>：能调哪些外部能力、企业模型目录、Skill/专家包摘要。
            密钥不在这里（去「应用连接」）；加人去「团队」。
          </p>
        </div>
      </header>

      {/* Login / identity */}
      {me?.authenticated ? (
        <section className="console-card org-config-card">
          <h2 className="org-config-card-title">当前身份</h2>
          <div className="org-config-identity-row">
            <div>
              <div className="org-config-identity-name">{me.displayName || me.email}</div>
              <div className="console-row-meta">
                角色 {(me.roles ?? []).join(" · ") || "—"} · 组织 {me.orgId || "default"}
                {!isAdmin ? " · 只读（需 org-admin 才能改配置）" : " · 可编辑"}
              </div>
            </div>
            <div className="org-config-identity-actions">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                退出
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <MemberLoginCard
          title="登录后查看企业设置"
          description="登录后可查看策略、模型目录与 Skill 摘要。本地开发默认 OTP 000000。"
          email={email}
          code={code}
          loading={loading}
          error={error}
          onEmailChange={setEmail}
          onCodeChange={setCode}
          onSubmit={() => void login()}
        />
      )}

      {me?.authenticated && error ? <InlineError message={error} /> : null}
      {message ? <p className="org-config-toast">{message}</p> : null}

      {snapshot ? (
        <>
          {/* Snapshot summary */}
          <section className="org-config-summary-grid">
            <div className="console-card org-config-stat">
              <div className="org-config-stat-label">配置版本</div>
              <div className="org-config-stat-value mono">{snapshot.version}</div>
              <div className="console-row-meta">
                更新于 {formatTime(snapshot.updatedAt)}
              </div>
            </div>
            <div className="console-card org-config-stat">
              <div className="org-config-stat-label">企业模型</div>
              <div className="org-config-stat-value">{modelCount}</div>
              <div className="console-row-meta">目录条目数（不含 API Key）</div>
            </div>
            <div className="console-card org-config-stat">
              <div className="org-config-stat-label">Skill / 专家包</div>
              <div className="org-config-stat-value">
                {skillNames.installed.length + expertNames.installed.length}
              </div>
              <div className="console-row-meta">
                <Link to="/skills">去 Skills 管理 →</Link>
              </div>
            </div>
            {isAdmin ? (
              <div className="console-card org-config-stat org-config-stat-action">
                <div className="org-config-stat-label">备份</div>
                <Button size="sm" variant="outline" onClick={() => void exportConfig()}>
                  导出配置 JSON
                </Button>
                <div className="console-row-meta">不含连接密钥</div>
              </div>
            ) : null}
          </section>

          {/* Policy — form first */}
          <section className="console-card org-config-card">
            <div className="org-config-card-head">
              <div>
                <h2 className="org-config-card-title">外发策略</h2>
                <p className="org-config-card-desc">
                  控制 Agent 通过公司网关<strong>允许 / 禁止</strong>调用哪些 Action（如{" "}
                  <code>hackernews.*</code>、<code>github.*</code>）。保存后会同步到运行时策略，控制台不能另写一套。
                </p>
              </div>
              <Button size="sm" disabled={loading || !isAdmin} onClick={() => void savePolicyFromForm()}>
                保存策略
              </Button>
            </div>

            <div className="org-config-form-grid">
              <Label className="field">
                <span>允许的 Action（逗号分隔，支持 * 通配）</span>
                <Input
                  value={policyForm.allowedActions}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, allowedActions: e.target.value }))}
                  placeholder="*  或  hackernews.*,github.*"
                  disabled={!isAdmin}
                  data-testid="policy-allowed"
                />
              </Label>
              <Label className="field">
                <span>禁止的 Action</span>
                <Input
                  value={policyForm.blockedActions}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, blockedActions: e.target.value }))}
                  placeholder="admin.*  或留空"
                  disabled={!isAdmin}
                  data-testid="policy-blocked"
                />
              </Label>
              <Label className="field">
                <span>敏感外发模式（egress）</span>
                <select
                  className="org-config-select"
                  value={policyForm.egressMode}
                  disabled={!isAdmin}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, egressMode: e.target.value }))}
                  data-testid="policy-egress"
                >
                  <option value="gateway_required">必须走公司网关</option>
                  <option value="gateway_preferred">优先走公司网关</option>
                  <option value="local_ok">允许本机直连</option>
                </select>
              </Label>
              <label className="org-config-check">
                <input
                  type="checkbox"
                  checked={policyForm.allowPersonalBYOK}
                  disabled={!isAdmin}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, allowPersonalBYOK: e.target.checked }))}
                />
                <span>允许员工使用个人模型 Key（BYOK）</span>
              </label>
            </div>

            <button
              type="button"
              className="org-config-advanced-toggle"
              onClick={() => setShowAdvancedPolicy((v) => !v)}
            >
              {showAdvancedPolicy ? "收起" : "展开"}高级：直接编辑 policy JSON
            </button>
            {showAdvancedPolicy ? (
              <div className="org-config-advanced">
                <textarea
                  className="org-config-json"
                  value={policyJson}
                  onChange={(e) => setPolicyJson(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  readOnly={!isAdmin}
                />
                <Button size="sm" disabled={loading || !isAdmin} onClick={() => void savePolicyFromJson()}>
                  从 JSON 保存
                </Button>
              </div>
            ) : null}
          </section>

          {/* Models */}
          <section className="console-card org-config-card">
            <div className="org-config-card-head">
              <div>
                <h2 className="org-config-card-title">企业模型目录</h2>
                <p className="org-config-card-desc">
                  给桌面/Agent 展示的<strong>公司推荐模型列表</strong>（名称、baseUrl、model id）。
                  <strong>不存放 API Key</strong>；推理默认仍直连模型厂商，不是聊天流量反代。
                </p>
              </div>
            </div>
            {modelCount === 0 ? (
              <div className="org-config-empty">
                当前还没有登记企业模型。需要时在下方 JSON 中增加{" "}
                <code>{`{ "models": [{ "id": "…", "displayName": "…", "baseUrl": "…" }] }`}</code>
                ，或等后续表单能力。
              </div>
            ) : (
              <div className="console-row-meta">已登记 {modelCount} 条模型目录（详见 JSON）。</div>
            )}
            <button
              type="button"
              className="org-config-advanced-toggle"
              onClick={() => setShowAdvancedModels((v) => !v)}
            >
              {showAdvancedModels ? "收起" : "展开"} models JSON
            </button>
            {showAdvancedModels ? (
              <div className="org-config-advanced">
                <textarea
                  className="org-config-json"
                  value={modelsJson}
                  onChange={(e) => setModelsJson(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  readOnly={!isAdmin}
                  data-testid="models-json"
                />
                <Button size="sm" disabled={loading || !isAdmin} onClick={() => void saveModelsFromJson()}>
                  保存模型目录
                </Button>
              </div>
            ) : null}
          </section>

          {/* Skills / experts summary */}
          <section className="console-card org-config-card">
            <div className="org-config-card-head">
              <div>
                <h2 className="org-config-card-title">Skill 与专家包</h2>
                <p className="org-config-card-desc">
                  这里只展示配置树里的包名摘要。上传、启用、分享请到 Skills 页操作。
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/skills">打开 Skills</Link>
              </Button>
            </div>
            <div className="org-config-lists">
              <div>
                <div className="org-config-list-label">已安装 Skills</div>
                {skillNames.installed.length ? (
                  <ul className="org-config-chip-list">
                    {skillNames.installed.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="org-config-empty">暂无 · 去 Skills 添加</div>
                )}
              </div>
              <div>
                <div className="org-config-list-label">专家包 installed / mine</div>
                {expertNames.installed.length || expertNames.mine.length ? (
                  <ul className="org-config-chip-list">
                    {expertNames.installed.map((n) => (
                      <li key={`i-${n}`}>installed/{n}</li>
                    ))}
                    {expertNames.mine.map((n) => (
                      <li key={`m-${n}`}>mine/{n}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="org-config-empty">暂无专家包目录</div>
                )}
              </div>
            </div>
            <p className="console-row-meta" style={{ marginTop: 12 }}>
              人员与权限：<Link to="/team">团队 · 成员状态（未激活 / 已启用 / 已停用）</Link>
              {" · "}
              外部账号：<Link to="/connections">应用连接</Link>
            </p>
          </section>
        </>
      ) : me?.authenticated ? (
        <div className="console-empty">{loading ? "加载中…" : "暂无配置快照"}</div>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
