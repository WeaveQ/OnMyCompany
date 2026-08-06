# Desktop ↔ Company 契约

双端并行开发时的 **接口与验收合同**。完整 HTTP 形状见 [API-NOTES.md](./API-NOTES.md) 与知识库 API v0.2。

| 端 | 仓 | 文档入口 |
|----|-----|----------|
| Desktop | `../onmyagent` | `AGENTS.md` · `docs/Architecture.md` · Phase2 · config-consistency |
| Company | **本仓** | `AGENTS.md` · `docs/Architecture.md` · 本文 |

---

## 1. 产品决策（不可漂移）

| ID | 决策 |
|----|------|
| **D1** | 未登录完整本机；「连接公司」入口可有；**无登录墙** |
| **B1** | 登录后可切回 **local** 配置档（非强制永久 company） |
| **C1** | 尊重 `policy.egress`；`gateway_required` 时敏感类走 Gateway |
| **Config** | local/company **同构 schema**；见 [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md) |
| **Secrets** | Gateway 路径 **不回传** provider secret 到桌面 |
| **Workspace** | 工作区 **本机**；Company 不做远程 workspace API |
| **Approval** | 企业审批队列 **非主路径**；本机 ApprovalMode 可保留 |

> 注：OMA `phase-2-enterprise-prep` 早期条目含「workspace isolation / approval」。以 **本表 + 知识库 0803** 为准。

---

## 2. 桌面状态机

```text
                    ┌──────────────┐
                    │  Mode A      │
         boot ─────►│  local only  │
                    │  no company  │
                    │  HTTP        │
                    └──────┬───────┘
                           │ user: connect + login OK
                           ▼
                    ┌──────────────┐
           logout ─│  Mode B      │◄── pull org config
                    │  session +   │    policy/effective
                    │  BaseUrl     │    optional /v1
                    └──────┬───────┘
                           │ activeProfile = local | company
                           ▼
                    配置指针切换；不换 schema
```

| 条件 | 允许 |
|------|------|
| 无 `companyBaseUrl` | 仅 A |
| 有 BaseUrl、无 session | 仅 A；可展示登录 UI |
| 有 session | B；可 `activeProfile=company` |
| Company 不可达 | 回退 local 可用；提示断连 |

---

## 3. 最小 API 面（桌面客户端）

| 用途 | 方法 | 路径 | 状态 |
|------|------|------|------|
| 探活 | GET | `/health` 或 `/api/company/health` | ✅ |
| 登录 | POST | `/api/company/auth/email/start\|verify` | ✅ |
| 我 | GET | `/api/me`（含 teams[]） | ✅ |
| 登出 | POST | `/api/company/auth/logout` | ✅ |
| 配置版本 | GET | `/api/org/config/manifest` | ✅ |
| 拉配置 | GET | `/api/org/config` | ✅ |
| 生效策略 | GET | `/api/policy/effective` | ✅ |
| 绑定 runtime token | POST | `/api/company/runtime-tokens` | ✅ |
| 执行 | POST | `/v1/actions/{id}` | ✅ Gateway |
| MCP | ALL | `/mcp` | ✅ Gateway |

鉴权：member session cookie/bearer；执行用 runtime token（`POST /api/company/runtime-tokens` 绑定 memberId）。  

**桌面实现（onmyagent · 2b 最小 · 2026-08-04）**：

| 模块 | 路径 |
|------|------|
| 设置持久化 | `apps/desktop/electron/company-settings.mjs` → `~/.onmyagent/company-settings.json` |
| HTTP 客户端 | `apps/desktop/electron/company-client.mjs`（D1：无 baseUrl 不发请求） |
| OrgConfig 镜像 | `apps/desktop/electron/company-config-mirror.mjs` → `profiles/company/config/` |
| IPC | `onmyagent:companySettings:*` · `onmyagent:company:connect`（`company-ipc.mjs`） |
| 单测 | `company-client.test.mjs`（login→config→token→/v1 mock） |

完整企业路径表：[API-NOTES.md](./API-NOTES.md)。

**禁止桌面调用（常态）：**

- 写 Connections secret（管理台 / ops）  
- 直写 `/api/runtime-policy`  
- 任何「企业 workspace CRUD」

---

## 4. 配置同步算法（桌面）

```text
onLogin / onForeground:
  m = GET manifest
  if m.version != local company manifest:
    cfg = GET /api/org/config   # or 304
    write profiles/company/config/**  (atomic replace preferred)
    set activeProfile=company if B1 default

onLogout:
  clear session + tokens
  do NOT delete profiles/company tree necessarily
    (or mark stale); activeProfile=local
  zero company HTTP after

onPolicyDeny:
  show PolicyDecision.message + checks[].source
```

同构字段消费：与 local 相同 resolve（skills 根、experts 根、models 列表）。

---

## 5. 与 OMA 域接线（2b 实现 checklist）

| 步骤 | OMA 落点（建议） | 依赖 Company |
|------|------------------|--------------|
| 1 | settings 存 `companyBaseUrl` | M0 health 可测 |
| 2 | AuthMode / 身份条 UI | M1 `/me`（可 mock） |
| 3 | 登录客户端 | M1 auth |
| 4 | 写 `profiles/company/config` | M2 org config |
| 5 | `activeProfile` 切换 | M2 |
| 6 | policy 条 + deny 文案 | M3 effective |
| 7 | Gateway client（无 secret） | M3 `/v1` |
| 8 | Personal 辅轨也可持 token | M3（Any Agent） |

**不要**在 Electron 内做第二套策略编辑真相源。

---

## 6. 联调验收

| # | 场景 | 通过 |
|---|------|------|
| 1 | 无 BaseUrl | 全本地；零 Company 请求 |
| 2 | 有 BaseUrl 未登录 | 可点连接；不强制墙 |
| 3 | 登录成功 | `/me` 有 memberId；可拉 config |
| 4 | company 配置 | 桌面 skills/experts 与企业一致 |
| 5 | 切回 local | 不丢本机配置；可继续工作 |
| 6 | 外发 Action | 走 `/v1`；桌面无 secret |
| 7 | 策略 deny | 可理解文案；审计可见（服务端） |
| 8 | 登出 | 回 Mode A；无残留企业调用 |
| 9 | Company 宕机 | Mode A 仍可用 |

---

## 7. Mock 约定（桌面可先做）

在 Company M1–M2 未就绪时，桌面可用 fixture：

```text
fixtures/org-config/
  manifest.json
  models.json
  policy.json
  skills/…
  experts/…
```

形状 **必须** 符合 [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md)。联调时只换 baseUrl，不改解析代码。

---

## 8. Changelog

| Date | Note |
| --- | --- |
| 2026-08-03 | 初版：对齐 OMA D1/B1/C1、配置同步、域接线、联调表 |
