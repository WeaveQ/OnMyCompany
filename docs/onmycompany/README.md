# OnMyCompany — 工程文档

本目录是 **随代码走的产品/工程 SoT**。  
系统架构见上级 [Architecture.md](../Architecture.md)。

**当前阶段（与 [ROADMAP.md](./ROADMAP.md) 一致）**：**试点主路径 MVP 已完成**  
（Gateway + 企业层 + 管理台 + gap-close + **G0/G1a/G2** + office catalog + 桌面 company 最小对接）。

## 按角色读

| 你是…         | 先读                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| 管理员 / 员工 | **[使用说明](../user-guide/index.md)**（文档站：`npm run dev:docs` → `:5181`）                           |
| AI Agent      | 根目录 [AGENTS.md](../../AGENTS.md) → [Architecture.md](../Architecture.md) → [ROADMAP.md](./ROADMAP.md) |
| 后端实现      | Architecture · CONFIG-SCHEMA · **[API-NOTES.md](./API-NOTES.md)** · RBAC · BOOTSTRAP                     |
| 桌面对接      | [DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md) · CONFIG-SCHEMA · OMA Phase2                                |
| 运维 / 初始化 | [使用说明 · 快速开始](../user-guide/quickstart.md) · [ENV.md](./ENV.md) · `.env.example`                 |

## 文档表

| 文档                                                             | 内容                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| [../user-guide/index.md](../user-guide/index.md)                 | **给人看的使用说明**；文档站 `npm run dev:docs`                       |
| [../Architecture.md](../Architecture.md)                         | 系统架构 · 与 OMA 分层 · 代码地图 · 鉴权                              |
| [ENV.md](./ENV.md)                                               | 环境变量 `OMC_*` · catalog · 并发帽                                   |
| [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md)                           | 配置同构 local/company · 磁盘树                                       |
| [DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md)                     | 双端契约 D1/B1/C1 · 状态机 · 联调                                     |
| [ROADMAP.md](./ROADMAP.md)                                       | **Goal/完成度** · M0–M7 · G0–G2 · 延期项                              |
| [GATEWAY-OBSERVABILITY-PLAN.md](./GATEWAY-OBSERVABILITY-PLAN.md) | **G0/G1a/G2 已落地**；G1b/G3 可选                                     |
| [SKILLS-PLAN.md](./SKILLS-PLAN.md)                               | Skills 组织/个人 · 添加弹窗                                           |
| [TEAM-ISOLATION.md](./TEAM-ISOLATION.md)                         | **已落地 IA**：企业账号 / 团队（合并）/ 企业设置 · 全公司 · 桌面 goal |
| [ORG-TEAM-PLAN.md](./ORG-TEAM-PLAN.md)                           | 企业/团队/账号总计划 · Phase 1 完成 · Phase 2/3 后续                  |
| [../plan/OMC-DEV-PLAN.md](../plan/OMC-DEV-PLAN.md)               | **下一轮 OMC**：开局 / 模型表单 / 专家 / 连接按队 / G3                |
| [../plan/OMA-DEV-PLAN.md](../plan/OMA-DEV-PLAN.md)               | **下一轮 OMA**（存本仓）：开局摘要 / `/v1` / 队头 / deny UX           |
| [RBAC.md](./RBAC.md)                                             | **角色白话 + 矩阵**（员工 / 企业管理员 / 企业审计 · 队角色）          |
| [BOOTSTRAP.md](./BOOTSTRAP.md)                                   | 双 Admin · 首登 · OTP · last-admin                                    |
| [API-NOTES.md](./API-NOTES.md)                                   | **企业 HTTP 路径表**（与 `routes.ts` 对齐 · 校验脚本）                |
| [OMNIROUTE-SIDECAR.md](./OMNIROUTE-SIDECAR.md)                   | **B+D** OmniRoute 模型边车 · 配置导航一体                             |
| [UPSTREAM.md](./UPSTREAM.md)                                     | 上游 / merge 备忘                                                     |
| [INIT-CHECKLIST.md](./INIT-CHECKLIST.md)                         | 初始化检查表                                                          |
| [MEMBER-ONBOARDING.md](./MEMBER-ONBOARDING.md)                   | 成员开局：登录公司后桌面该看见什么（无工作台）                        |

## 钉死决策

1. 单进程交付（非独立 company-api 反代）。
2. MVP = Docker + SQLite。
3. **配置同构**；OrgConfig 单写 policy → runtime-policy。
4. 连接组织共享；run 可归因 memberId（runtime-token 绑定）。
5. 工作区本机；无企业审批队列主路径；D1 无登录墙。
6. Env **canonical = `OMC_*`**。

## 当前状态

| 项                                                          | 状态          |
| ----------------------------------------------------------- | ------------- |
| Gateway 内核                                                | ✅            |
| G0 并发帽 · G1a 连接主备 · G2 瘦计量                        | ✅            |
| Office catalog（默认 office · 可直接使用 · 文档 chip）      | ✅            |
| 文档 / 包名 / `OMC_*`                                       | ✅            |
| `src/company/` 企业路由 + 测试                              | ✅            |
| 登录 / OrgConfig export-import / Skills / 团队              | ✅ MVP        |
| 管理台 IA（企业账号 · 团队合并 · 企业设置 · 计量 · Skills） | ✅ Phase 1    |
| 角色：员工 / 企业管理员 / 企业审计 + last-admin 保护        | ✅            |
| 桌面 company 设置 + 持久 session 文件                       | ✅ 最小       |
| 真飞书 OAuth / 生产 SMTP 运营 / G1b LLM 反代                | ⏳ 延期或可选 |

实现代码：`src/company/` · 管理台 `web/src/` · 挂载 `src/server/connect-app.ts`。
