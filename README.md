# OnMyCompany

**企业 Agent 管控面 + 外发 Gateway**（内网试点；**不对商用开放**）。

| | |
|--|--|
| **产品** | OnMyCompany |
| **配套桌面** | [OnMyAgent](https://github.com/WeaveQ/OnMyAgent)（Apache-2.0，本地优先） |
| **仓库** | https://github.com/WeaveQ/OnMyCompany |
| **MVP 部署** | Docker Compose + SQLite |
| **阶段** | **试点主路径已完成**（含 gap-close · G0/G1a/G2 · office catalog · 企业/团队 IA Phase 1） |
| **许可** | **非商用源码可见** — 见 `LICENSE` / `NOTICE`；商用须单独授权。OnMyAgent 仍为 Apache-2.0。 |

---

## 它做什么

```text
OnMyCompany = 一个进程 / 一个主端口
├── Gateway
│   · 连接 / OAuth · /v1 Actions · MCP · policy · runtime token · runs
│   · G0 并发帽 · G1a Connection 主备 · 归因 memberId
├── 企业层（src/company/ · MVP 已落地）
│   · 登录 / 成员 / 团队 · OrgConfig · Skills · 策略 · 审计 · 用量
└── 管理台（web/）
    · 概览 · 应用连接 · 企业账号 · 团队 · 企业设置
    · 观测：计量 · 运行 · 审计 · Skills · API Key
```

**管**：身份、组织 Skill/专家/模型配置、凭据与外发、策略、审计、瘦计量。  
**不管**：员工本机对话、工作区目录结构、企业审批队列主路径、公网多租户、默认 LLM 全量反代。

任意 Agent（OnMyAgent / curl / MCP 客户端）可凭 runtime token 调 `/v1` 或 `/mcp`。  
企业 HTTP 路径表：[docs/onmycompany/API-NOTES.md](docs/onmycompany/API-NOTES.md)。

---

## 开发与测试脚本（对齐 OMA 分层习惯）

需要 **Node.js 22.18+**（推荐 24）。

| 命令 | 作用 |
|------|------|
| `npm run dev` | 本地 API + 管理台 |
| `npm test` | 全量 vitest |
| `npm run test:company` | 企业层 `src/company` |
| `npm run test:web` | 管理台 `web/src` |
| `npm run test:server` | Gateway `src/server` |
| `npm run test:unit` | 后端 `src` |
| `npm run typecheck` / `check:type` | 类型检查 |
| `npm run check` | typecheck + test |
| `npm run ci` / `verify` | lint + format + typecheck + test（与 GitHub Actions 一致） |
| `npm run check:docs` | API-NOTES 与路由校验 |

CI：`.github/workflows/ci.yml` 在 `main` / `feat/**` / PR 上跑 `npm run ci`。

## 5 分钟本地跑通

```bash
cd /path/to/onmycompany
cp .env.example .env
npm install
npm run dev
```

| 入口 | URL |
|------|-----|
| API / OpenAPI | http://127.0.0.1:3100 · http://127.0.0.1:3100/docs |
| 健康检查 | http://127.0.0.1:3100/health · `GET /api/company/health` |
| 管理台 | http://127.0.0.1:5180 |
| 模型边车 OmniRoute（可选） | http://127.0.0.1:20128 · `npm run dev:omniroute` |

企业登录（dev OTP）：`admin@company.internal` + `OMC_DEV_OTP`（默认 `000000`）。  
Runtime 执行示例（需 token 时见 `data/TEST-CREDENTIALS.txt` 或控制台铸造）：

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H "Authorization: Bearer <runtime-token>" \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

生产向建议：

```bash
export OMC_ADMIN_TOKEN="…"
export OMC_ENCRYPTION_KEY="…"
export OMC_DATA_DIR="$PWD/data"
export OMC_ALLOWED_ACTIONS="hackernews.*,github.*"
export OMC_CATALOG_PROFILE=office   # 默认；full = 全量 1000+ apps
```

环境变量：[docs/onmycompany/ENV.md](docs/onmycompany/ENV.md) · [docs/configuration.md](docs/configuration.md)

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

---

## 文档地图

| 文档 | 用途 |
|------|------|
| **[AGENTS.md](AGENTS.md)** | 开发 / Agent 运行手册 |
| **[docs/Architecture.md](docs/Architecture.md)** | 系统架构 · 与 OnMyAgent 分层 |
| **[docs/onmycompany/CONFIG-SCHEMA.md](docs/onmycompany/CONFIG-SCHEMA.md)** | 配置同构 |
| **[docs/onmycompany/DESKTOP-CONTRACT.md](docs/onmycompany/DESKTOP-CONTRACT.md)** | 双端契约 |
| **[docs/onmycompany/API-NOTES.md](docs/onmycompany/API-NOTES.md)** | 企业 HTTP 路径表（与 `src/company/routes.ts` 对齐） |
| [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md) | 完成度 · 延期项 · **goal 状态** |
| [docs/onmycompany/GATEWAY-OBSERVABILITY-PLAN.md](docs/onmycompany/GATEWAY-OBSERVABILITY-PLAN.md) | G0/G1a/G2 计划与落地 |
| [docs/onmycompany/ENV.md](docs/onmycompany/ENV.md) | `OMC_*` 环境变量 |
| [docs/runtime-api.md](docs/runtime-api.md) | `/v1` · MCP · OpenAPI（Gateway） |
| [docs/configuration.md](docs/configuration.md) | 配置说明 |

**桌面侧：**

| 主题 | 路径 |
|------|------|
| Architecture | [`../onmyagent/docs/Architecture.md`](../onmyagent/docs/Architecture.md) |
| 配置 2a | [`../onmyagent/docs/design/2026-08-02-config-consistency.md`](../onmyagent/docs/design/2026-08-02-config-consistency.md) |
| Phase 2 | [`../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md`](../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md) |

---

## 配置同构（一眼）

```text
桌面 ~/.onmyagent/profiles/{local|company}/config/
企业 $DATA_DIR/org/default/config/
        └── manifest · models · policy · memory/settings
            skills · experts · tools/{mcp,gateway}
```

详见 [CONFIG-SCHEMA.md](docs/onmycompany/CONFIG-SCHEMA.md)。

---

## 仓库布局

```text
src/
  core/          # 执行、策略、office-catalog
  providers/     # 连接器
  server/        # HTTP · 护栏 · 挂 company 路由
  company/       # 企业逻辑（auth · teams · skills · org-config · audit · usage）
  oauth/ mcp/ …
web/             # 管理台（概览 · 连接 · 团队 · 计量 · Skills…）
migrations/
docs/
  Architecture.md
  onmycompany/   # 产品工程文档 · API-NOTES · ROADMAP
examples/
```

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | API `:3100` + Web `:5180` |
| `npm run dev:api` | 仅 API |
| `npm run dev:omniroute` | 模型边车 OmniRoute `:20128`（B） |
| `npm run omniroute:up` | Docker 拉起 OmniRoute 边车 |
| `npm test` | vitest |
| `npm run fix-check` | lint + format + typecheck |
| `node scripts/check-docs-api-notes.mjs` | API-NOTES ↔ routes 一致性 |
| `npm run generate:catalog` | provider 定义变更后 |
| `npm run generate:registry` | provider 注册表 |

---

## 工程分期（摘要）

| 阶段 | 状态 | 目标 |
|------|------|------|
| **M0–M7** | ✅ | Gateway + 企业身份 + OrgConfig + 管理台 + 桌面最小对接 |
| **Skills S1–S5** | ✅ | 组织/个人 Skills 目录与分享 |
| **Gap-close** | ✅ | P7/P5 审计/导出/成员 |
| **G0 / G1a / G2** | ✅ | 并发帽 · 连接主备 · 瘦计量 |
| **Office catalog** | ✅ | 默认办公白名单 + 可直接使用 + 文档筛选 |
| **G1b / G3 / 真飞书** | ⏳ | 可选或延期 |

详见 [docs/onmycompany/ROADMAP.md](docs/onmycompany/ROADMAP.md)。

---

## 明确非目标（MVP）

- 公网多租户 SaaS / 商业预扣账单  
- 企业审批队列主路径  
- 对话上云、托管员工工作区  
- Cloudflare / D1 作为默认部署  
- 默认把所有 LLM chat 反代进 Gateway（G1b 仅升格后）

---

## 许可证

- 代码：Apache-2.0，见 `LICENSE.txt`。  
- 第三方服务商标仅用于互操作标识，见 `NOTICE.md`。

<!-- ci: pr gate -->
