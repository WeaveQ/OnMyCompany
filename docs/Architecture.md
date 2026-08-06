# Architecture — OnMyCompany

OnMyCompany 是 **内网企业管控面 + 外发 Gateway**：身份、组织配置、连接与 Action 执行、策略、审计。  
本仓为 **OnMyCompany** 服务端（单进程：企业管控 + Gateway）。

| | |
| --- | --- |
| **产品阶段** | **试点 MVP 已完成** → Gateway + 企业层 + 管理台 + G0/G1a/G2 + office catalog；见 [ROADMAP](./onmycompany/ROADMAP.md) |
| **配套桌面** | [OnMyAgent](../../onmyagent)（本地优先；Phase 2） |
| **桌面架构 SoT** | `onmyagent/docs/Architecture.md` |
| **桌面配置 2a** | `onmyagent/docs/design/2026-08-02-config-consistency.md`（**已落地**） |
| **桌面 Phase 2** | `onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md` |
| **本仓分期** | [onmycompany/ROADMAP.md](./onmycompany/ROADMAP.md) |
| **配置同构** | [onmycompany/CONFIG-SCHEMA.md](./onmycompany/CONFIG-SCHEMA.md) |

---

## 1. 产品分层（与桌面固定对齐）

```text
┌─────────────────────────────────────────────────────────────┐
│  OnMyAgent（桌面 monorepo · 本地优先）                         │
│  apps/desktop · app · server(本地) · orchestrator             │
│  · OpenCode 主轨会话 / archive / 工作区                        │
│  · Personal 辅轨（本机 CLI agent harness）                     │
│  · profiles/local|company/config（同构 schema）                 │
│  · Mode A 未登录 = 完整本机；零 Company HTTP（D1）               │
└───────────────────────────┬─────────────────────────────────┘
                            │ companyBaseUrl + member session
                            │ GET org config · policy/effective
                            │ POST /v1 · /mcp（无 secret 回传）
┌───────────────────────────▼─────────────────────────────────┐
│  OnMyCompany（本仓 · 内网单进程）                               │
│  · 企业身份 / 成员 / bootstrap                                 │
│  · Org 当前配置（Config 真相 · 与桌面同构）                      │
│  · Gateway：Connections · OAuth · /v1 · MCP · token · runs     │
│  · 策略单写 → runtime-policy · 审计                            │
│  · 管理 Web（概览 · 应用连接 · 团队 · Skills · 更多）              │
└─────────────────────────────────────────────────────────────┘
```

| 产品 | 形态 | 职责 | 明确不管 |
|------|------|------|----------|
| **OnMyAgent** | 桌面 | 本地办公 Agent 工作台；双运行时；本机审批 | 企业 DB、策略编辑后台、secret 存储 |
| **OnMyCompany** | 内网服务 | 身份、OrgConfig、Gateway、策略、审计 | 员工对话、工作区 git 树、公网多租户 |

### 1.1 相对桌面 Architecture 的「不对称」

桌面文档 Phase 2 早期写过「workspace isolation / approval」。**当前产品定稿**（与知识库 0803 一致）：

| 主题 | 定稿 |
|------|------|
| 工作区 | **始终本机**（OMA `domains/workspace` + server）；Company **不托管**工作区结构 |
| 企业审批队列 | **主路径不做**；桌面可保留本机 `ApprovalMode` |
| 隔离 | 默认 **单 Org**；执行/审计按 **memberId** 归因；连接 **组织共享**（MVP） |
| 配置 | `local` / `company` **同构**；company 镜像只读为主 |

桌面实现仍以 OMA 仓文档为准；本仓以本文 + `docs/onmycompany/*` 为准。冲突时：**配置同构与 D1/B1/C1 不可回退**。

---

## 2. 系统架构（本仓）

```text
Clients
  · OnMyAgent (primary)
  · Any Agent: curl / MCP inspector / SDK
        │
        ▼
┌──────────────────────────────────────────┐
│  HTTP 单进程（Hono · Node）                 │
│  PORT 默认 3000                             │
│                                            │
│  /health · /api/company/health             │
│  /api/company/auth/* · /api/me · teams     │  ← src/company（已落地）
│  /api/org/config/* · /api/catalog/skills*  │  ← src/company
│  /api/org/skills* · /api/policy/effective  │  ← src/company
│  /api/company/audit|usage|pricing|runs|overview │  ← 审计 + G2 计量
│  /api/connections · /api/oauth · /api/runs │  ← Connect
│  /v1/actions/* · /mcp · /openapi.json      │  ← 执行面（G0 帽 · G1a 主备）
│  web 静态 / Vite dev :5180                 │
└──────────────────────────────────────────┘
        │
        ├─ SQLite  data/connect.sqlite（+ company 表/目录）
        ├─ OrgConfig 磁盘树  data/org/default/config/   ← 与桌面同构
        ├─ Catalog 默认 office 白名单（OMC_CATALOG_PROFILE）
        └─ Secrets  仅服务端（encryption key）
```

### 2.1 代码地图

```text
src/
  server/           # composition：connect-app、路由、存储接线
    api/            # runtime-api、auth(ops)、openapi、policy-input…
    storage/        # sqlite / policy / tokens / runs
    actions/        # action-runner、connection-fallback(G1a)、idempotency
    concurrency-guard.ts  # G0 in-flight 帽
  core/             # 执行、office-catalog、SSRF fetch、action-policy — 少动
  providers/        # 连接器定义 + lazy executors
  oauth/ mcp/
  company/          # ★ 企业：auth · members · org-config · audit · usage
web/                # 管理台：概览 · 连接 · 团队 · 计量 · Skills · …
migrations/         # Connect schema；company 迁移追加
docs/onmycompany/   # 产品工程 SoT
```

**Upstream 边界**：企业逻辑不进 `providers/*`；core 执行主路径非必要不改。见 [UPSTREAM.md](./onmycompany/UPSTREAM.md)。

---

## 3. 配置架构（与 OnMyAgent 同构 · 核心）

两端 **同一 schema**；切换的是指针与写权限，不是产品逻辑。

### 3.1 桌面磁盘（OMA · 2a 已落地）

```text
~/.onmyagent/
  profiles/
    local/config/     # 未登录真相；可写
    company/config/   # 仅登录后创建；镜像 OrgConfig
  data/user/awareness/   # 记忆正文 — 不在 config
  skills/ · marketplaces/  # legacy；迁移只复制不删
```

### 3.2 企业磁盘（OMC · M0/M2）

```text
$OMC_DATA_DIR/   # 默认 ./data
  connect.sqlite           # 连接、token、runs、（未来）members
  org/default/config/      # ★ 与 profiles/*/config 同构
    manifest.json
    models.json
    policy.json
    memory/settings.json
    skills/
    experts/installed|mine/
    tools/mcp.json
    tools/gateway.json     # 无 secret；连接/Action 目录投影
```

### 3.3 数据通道（两通道 + 桌面本机）

| 通道 | 内容 | 同步 |
|------|------|------|
| **① OrgConfig** | skills/experts/models/policy/tools/memory开关 | 登录后 `GET /api/org/config` → 桌面 `profiles/company` |
| **② UserData** | 记忆正文、可选文件夹 | 默认同机；API 后置（M7） |
| **本机 only** | 对话、session-archive、workspace 工程 | **永不**进 Company 主路径 |
| **Secrets** | 连接密钥、ops token | 仅服务端；不进 config 导出 |

详表：[CONFIG-SCHEMA.md](./onmycompany/CONFIG-SCHEMA.md)。

### 3.4 桌面 resolve 语义（实现在 OMA，契约在此）

```text
activeProfile = local | company
activeConfig  = profiles/{activeProfile}/config

未登录:
  activeProfile 强制 local
  禁止创建 profiles/company
  禁止任何 companyBaseUrl HTTP

已登录:
  拉 manifest → 必要时整包 config
  company 树：skills/experts/models/policy 只读（或个人叠加以后再议）
  敏感外发：走 Company /v1（C1 egress）
  可切回 local（B1）
```

OMA 代码锚点：

| 关注点 | 路径（onmyagent） |
|--------|-------------------|
| Profile 路径 / resolve | `apps/desktop/electron/config-profile-paths.mjs` |
| 迁移 copy-not-delete | `apps/desktop/electron/ensure-local-config-migrated.mjs` |
| Skills 根 | `desktop-paths` + `runtime.mjs` 物化 |
| Experts | `expert-marketplace.mjs` |
| 未来 company HTTP | `domains/cloud` 演化 / settings（2b） |

---

## 4. 运行时与鉴权分层

```text
ops-admin          OMC_ADMIN_TOKEN / Connect admin session
                   → 连接 secret、OAuth client、底层调试

org-admin/member   /api/company/auth → member session
                   → OrgConfig、members、effective policy
                   → 登录签发 runtime token（绑 memberId）

执行面             Authorization: runtime token 或 member session
                   → /v1/actions · /mcp
                   → run 写 memberId（M3）
```

| 面 | 前缀 | 谁用 |
|----|------|------|
| 探活 | `/health` | 任意 |
| 企业 | `/api/company/*` · `/api/me` · `/api/org/*` | 成员 / 管理台 |
| 运维 | `/api/auth/session` · 写 connections | ops-admin |
| Connect 目录 | `/api/actions*` · `/api/providers*` | 两端 |
| 执行 | `/v1/*` · `/mcp` | Agent / 桌面 |

策略 **单写**：`PUT /api/org/config/policy` → 合成 `runtime-policy`；企业模式禁 Console 直写。

---

## 5. 与桌面域的对接图（实现指引）

| OMA 域 / 模块 | Company 关系 |
|---------------|--------------|
| `domains/session` | 会话仍本地；注入的 skills/experts 随 `activeConfig` |
| `domains/plugins` / expert-marketplace | company 模式列表源 = 企业配置镜像 |
| `domains/connections` / settings providers | 个人 BYOK 仍本机；企业外发走 Gateway |
| `domains/cloud` | 演化为「连接公司 / 登录」，非公有云 Den 叙事 |
| `domains/workspace` | **不**改为远程 Company 工作区 |
| `domains/local-agents` | Personal 辅轨；外发同样可走 token→Company（Any Agent） |
| 本地 `apps/server` | **不是** OnMyCompany；继续服务本机 session/skill API |

---

## 6. 部署（MVP）

| 项 | 选择 |
|----|------|
| 进程 | **一个** Node 服务（Connect + company） |
| 存储 | SQLite + 磁盘 OrgConfig |
| 交付 | Docker Compose 优先；`npm run dev` 本地 |
| 非 MVP | Cloudflare Workers / D1 / Fly 作产品默认 |

---

## 7. 命令

```bash
npm install
npm run dev          # API :3000 + web :5180
npm run dev:api
npm test
npm run fix-check    # 改代码默认收尾
npm run generate:catalog
```

冒烟：`GET /health` · `POST /v1/actions/hackernews.get_top_stories`。

---

## 8. 文档地图（本仓）

| 文档 | 角色 |
|------|------|
| **本文** | 系统架构 + 与 OMA 边界 |
| [AGENTS.md](../AGENTS.md) | Agent 运行手册 |
| [onmycompany/CONFIG-SCHEMA.md](./onmycompany/CONFIG-SCHEMA.md) | 配置同构细节 |
| [onmycompany/DESKTOP-CONTRACT.md](./onmycompany/DESKTOP-CONTRACT.md) | 双端契约与验收 |
| [onmycompany/ROADMAP.md](./onmycompany/ROADMAP.md) | M0–M7 |
| [onmycompany/API-NOTES.md](./onmycompany/API-NOTES.md) | 路径约定 |
| [runtime-api.md](./runtime-api.md) | Connect `/v1` 技术细节 |
| [configuration.md](./configuration.md) | `OMC_*` 环境变量 |

桌面侧权威：**不要**在本仓复制 OMA monorepo 长文；链接到 `../onmyagent/docs/`。

---

## 9. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-03 | 初版：对齐 OMA Architecture / config-consistency / Phase2；配置两通道；域对接表 |
| 2026-08-04 | 同步试点完成态：G0/G1a/G2、office catalog、计量 API、管理台 IA |
