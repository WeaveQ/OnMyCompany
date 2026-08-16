# AGENTS.md — OnMyCompany

[English](AGENTS.md) · **简体中文**

**目标读者：AI Agent / 人类开发者。** 运行手册，不是营销页。

| 字段         | 值                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **产品**     | OnMyCompany（企业管控面 + Gateway）                                                                                                    |
| **许可**     | **非商用**（`LICENSE`）；商用须单独授权。OMA 为 Apache-2.0                                                                             |
| **配套桌面** | `../onmyagent` / WeaveQ OnMyAgent（Phase 2；company 对接最小落地）                                                                     |
| **当前阶段** | **试点 MVP + 企业/团队 IA Phase 1** — 见 [ROADMAP](docs/onmycompany/ROADMAP.md) · [TEAM-ISOLATION](docs/onmycompany/TEAM-ISOLATION.md) |
| **验证**     | `npm run ci`（= Actions）；`test:company` / `test:web` / `test:server` 分层                                                            |
| **架构 SoT** | [`docs/Architecture.md`](docs/Architecture.md)                                                                                         |
| **配置 SoT** | [`docs/onmycompany/CONFIG-SCHEMA.md`](docs/onmycompany/CONFIG-SCHEMA.md)                                                               |
| **API 路径** | [`docs/onmycompany/API-NOTES.md`](docs/onmycompany/API-NOTES.md)                                                                       |
| **双端契约** | [`docs/onmycompany/DESKTOP-CONTRACT.md`](docs/onmycompany/DESKTOP-CONTRACT.md)                                                         |

---

## 0. 开工前必读（按任务）

| 任务类型                  | 至少读                                    |
| ------------------------- | ----------------------------------------- |
| 任意改动                  | **本文铁律** + Architecture §1–2          |
| 给人看的使用说明          | [`docs/user-guide/`](docs/user-guide/)    |
| 配置 / OrgConfig / policy | CONFIG-SCHEMA + Architecture §3           |
| 鉴权 / 成员 / token       | BOOTSTRAP + RBAC + API-NOTES              |
| 桌面对接 / mock           | DESKTOP-CONTRACT + OMA config-consistency |
| Gateway / provider        | `docs/runtime-api.md` + coding 约定       |

桌面长文 **不要复制进本仓**；链接：

- `../onmyagent/docs/Architecture.md`
- `../onmyagent/docs/design/2026-08-02-config-consistency.md`
- `../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md`
- `../onmyagent/AGENTS.md`

---

## 1. 铁律（违反即错）

### 产品与边界

1. **Gateway 内核少动**：`src/core/`、provider 执行主路径、OAuth 刷新，非任务必需不改。
2. **新企业逻辑进 `src/company/`**；禁止把 Org/成员写进 `providers/*`。
3. **对外产品名只有 OnMyCompany**（+ 桌面 OnMyAgent）。
4. **不做主路径**：企业审批队列、对话上云、工作区托管、公网多租户、CF/D1 默认部署。

### 配置同构（与 OMA 对齐）

5. **local / company 同一 schema**。切换指针，不换产品逻辑。
6. **OrgConfig 是企业配置真相**；桌面 `profiles/company/config` 只是镜像。
7. **策略单写**：只允许经 OrgConfig `policy` 写入并合成 runtime-policy。
8. **config 永不含 secret**。
9. **记忆正文 / 对话 / workspace 不进 OrgConfig**。

### 身份、执行、桌面

10. **ops-admin ≠ org-admin**。
11. **执行可归因**：runtime-token 绑定 member；run 带 `memberId`；MVP 连接 = **组织共享**。
12. **凭据不回传客户端**。
13. **尊重 D1**：未登录桌面必须零企业流量。
14. **Any Agent**：`/v1` · `/mcp` 须 curl/MCP 可调。
15. **改完验证**：`npm test` / 相关 vitest；provider 定义变更则 `generate:catalog`。

---

## 2. 分层一览

```text
OnMyAgent（桌面）                    OnMyCompany（本仓）
  OpenCode 主轨 / Personal 辅轨        身份 / OrgConfig / 审计
  profiles/local|company/config  ◄──  同构 ──►  data/org/default/config
  本机 session · workspace             Gateway /v1 · MCP · connections
  Mode A 未登录完整可用                 内网单进程 · SQLite
```

| 做（本仓）                                      | 不做                        |
| ----------------------------------------------- | --------------------------- |
| 企业登录、成员、团队、bootstrap                 | 桌面 OpenCode 主轨          |
| OrgConfig CRUD · Skills catalog · export/import | 本机迁移 2a（在 OMA）       |
| 策略合成、token↔member · logout 吊销            | 第二套 Electron 策略真相    |
| 连接 secret、runs 审计 · 瘦计量 usage           | 员工对话上云 / 商业账单     |
| 管理台（概览/连接/团队/计量/Skills…）           | 企业审批队列主路径          |
| G0 并发帽 · G1a 连接主备 · office catalog       | 默认 LLM 全量反代（G1b）    |
| 桌面 company API + 契约                         | 真飞书生产换票（stub 已有） |

详图：[`docs/Architecture.md`](docs/Architecture.md)。路径表：[`docs/onmycompany/API-NOTES.md`](docs/onmycompany/API-NOTES.md)。

---

## 3. 仓库地图

```text
src/server/          # 挂 company 路由 · 并发护栏 · action-runner
src/core/            # 执行与策略 · office-catalog — 内核少动
src/providers/       # 连接器；生产 allowlist 由 catalog profile 收窄
src/company/         # ★ auth · teams · org-config · skills · audit · usage
web/                 # 管理台（概览 · 应用连接 · 团队 · 计量 · 更多）
migrations/
docs/Architecture.md
docs/onmycompany/    # 产品工程文档 · API-NOTES · ROADMAP · GATEWAY plan
examples/
```

挂载：`registerCompanyRoutes` → 与 `/health` 同进程；见 `src/server/connect-app.ts`。

---

## 4. 配置与数据（速查）

| 通道         | 路径/API                                      | 说明                           |
| ------------ | --------------------------------------------- | ------------------------------ |
| ① OrgConfig  | `data/org/default/config` · `/api/org/config` | 与 OMA profile config **同构** |
| ② UserData   | `/api/me/userdata/*`                          | 后置；默认同机                 |
| Secrets      | connections + encryption key                  | 仅服务端                       |
| 桌面 local   | `~/.onmyagent/profiles/local/config`          | 2a 已落地                      |
| 桌面 company | `profiles/company/config`                     | 登录后镜像                     |

硬规则：[`CONFIG-SCHEMA.md`](docs/onmycompany/CONFIG-SCHEMA.md)。

---

## 5. 命令

```bash
npm install
cp .env.example .env    # 可选
npm run dev             # API :3100 + web :5180（勿与 OnMyAgent 5173/8787 冲突）
npm run dev:docs        # 使用说明文档站 :5181
npm run dev:api
npm test
npm run test:affected   # 按 git diff 选 company|web|server 切片
npm run fix-check
npm run generate:catalog
```

冒烟：

```bash
curl -s http://localhost:3100/health
curl -s -X POST http://localhost:3100/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' -d '{"input":{}}'
```

---

## 6. 环境变量（最小）

| 变量                           | 用途                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `PORT`                         | 默认 **3100**（与 `.env.example` / `dev-local` 一致） |
| `OMC_DATA_DIR`                 | SQLite + org 树                                       |
| `OMC_ADMIN_TOKEN`              | ops-admin                                             |
| `OMC_ENCRYPTION_KEY`           | 凭据加密                                              |
| `OMC_ALLOWED_ACTIONS`          | 执行面 allowlist                                      |
| `OMC_BOOTSTRAP_ADMIN_EMAIL`    | 首个 org-admin                                        |
| `OMC_CATALOG_PROFILE`          | `office`（默认）/ `full`                              |
| `OMC_ALLOWED_SERVICES`         | 覆盖 profile 的 service 列表或 `*`                    |
| `OMC_MAX_IN_FLIGHT`            | G0 全局并发帽（默认 100）                             |
| `OMC_MAX_IN_FLIGHT_PER_MEMBER` | G0 每 member 帽（默认 10）                            |

**Canonical = `OMC_*`**。完整表见 [`ENV.md`](docs/onmycompany/ENV.md)。

---

## 7. 编码约定（摘要）

- 一事实一处；provider 元数据不在 executor 重复。
- 禁止 barrel `index.ts`；禁止 provider 用全局 `fetch`（走 guarded fetcher）。
- `interface` 对象契约；oxfmt / oxlint；Web 只在 `web/`。
- `/v1` 形状稳定；扩展 `memberId` 等须文档化。
- 企业路由前缀见 `API-NOTES.md`。
- **嵌套指令（按目录）：**
  - [`src/providers/AGENTS.md`](src/providers/AGENTS.md) — 连接器目录边界
  - [`src/company/AGENTS.md`](src/company/AGENTS.md) — 企业域
  - [`src/server/AGENTS.md`](src/server/AGENTS.md) — Gateway HTTP / 执行
  - [`web/AGENTS.md`](web/AGENTS.md) — 管理台前端

### 验证命令（机械门禁）

| 命令                       | 用途                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run ci`               | lint + format + typecheck + test + design + i18n-cjk + pr-english |
| `npm run check:boundaries` | company vs providers/core 导入边界                                |
| `npm run check:design`     | theme.css ↔ tokens snapshot                                       |
| `npm run test:affected`    | 按 `origin/main...HEAD` 路径选 company/web/server 切片            |

### Harness / 会话证据（Grok）

- Better Harness 审核本仓时使用 `--platform grok --workspace <本仓绝对路径>`。
- 若 `eligibleSessions=0` / `missing-required-root`：会话根未匹配当前 workspace，**不能**据此声称「无人开发」；先确认 Grok 会话 cwd/workspace 绑定。
- 产品代码变更验收以 **CI / `npm run ci`** 为准，不依赖 harness 会话人口。

---

## 8. 与 OMA Agent 的分工

| 仓            | 负责                                                 | 禁止                               |
| ------------- | ---------------------------------------------------- | ---------------------------------- |
| **本仓**      | Company 服务端、Gateway、管理台、OrgConfig           | 改 OMA 桌面业务主路径              |
| **onmyagent** | 2a 巩固、2b BaseUrl/登录/镜像 config、Gateway 客户端 | 在 Electron 做企业 DB/策略编辑真相 |

契约变更：先改 `DESKTOP-CONTRACT` + `CONFIG-SCHEMA` + API-NOTES，再改两端代码。

---

## 9. 阶段检查清单

- [ ] 读铁律 + Architecture §1
- [ ] 配置相关？→ CONFIG-SCHEMA
- [ ] 桌面相关？→ DESKTOP-CONTRACT；未登录零流量
- [ ] policy？→ 仍单写入口
- [ ] 连接？→ 仍组织共享
- [ ] 收尾 `npm run fix-check`（或说明跳过原因）

---

## 10. 链接

| 资源              | 路径                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| README            | [README.md](README.md) · [中文](README.zh-CN.md)                          |
| 使用说明          | [docs/user-guide/index.md](docs/user-guide/index.md) · `npm run dev:docs` |
| Architecture      | [docs/Architecture.md](docs/Architecture.md)                              |
| 产品工程文档      | [docs/onmycompany/README.md](docs/onmycompany/README.md)                  |
| 路线图            | [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md)                |
| 运行时 API        | [docs/runtime-api.md](docs/runtime-api.md)                                |
| 桌面 Architecture | [../onmyagent/docs/Architecture.md](../onmyagent/docs/Architecture.md)    |
