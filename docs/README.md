# Documentation index

## OnMyCompany product（优先）

| Doc                                                                | Description                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [Architecture.md](Architecture.md)                                 | **系统架构** · OMA 分层 · 代码地图 · 鉴权 · 配置通道 |
| [onmycompany/README.md](onmycompany/README.md)                     | 工程文档入口（按角色）                               |
| [onmycompany/CONFIG-SCHEMA.md](onmycompany/CONFIG-SCHEMA.md)       | local/company **配置同构**                           |
| [onmycompany/DESKTOP-CONTRACT.md](onmycompany/DESKTOP-CONTRACT.md) | 双端契约与联调                                       |
| [onmycompany/ROADMAP.md](onmycompany/ROADMAP.md)                   | 试点 MVP 完成度 · 延期项                             |
| [onmycompany/BOOTSTRAP.md](onmycompany/BOOTSTRAP.md)               | 双 Admin / 首登 / OTP                                |
| [onmycompany/RBAC.md](onmycompany/RBAC.md)                         | 权限矩阵                                             |
| [onmycompany/API-NOTES.md](onmycompany/API-NOTES.md)               | **企业 HTTP 路径**（对齐 `src/company/routes.ts`）   |
| [onmycompany/UPSTREAM.md](onmycompany/UPSTREAM.md)                 | fork / merge                                         |
| [onmycompany/INIT-CHECKLIST.md](onmycompany/INIT-CHECKLIST.md)     | 初始化检查表                                         |

Root: [README.md](../README.md) · [AGENTS.md](../AGENTS.md)

## OnMyAgent（sibling · 链接）

| Topic          | Path                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture   | [`../../onmyagent/docs/Architecture.md`](../../onmyagent/docs/Architecture.md)                                                           |
| Config 2a      | [`../../onmyagent/docs/design/2026-08-02-config-consistency.md`](../../onmyagent/docs/design/2026-08-02-config-consistency.md)           |
| Phase 2        | [`../../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md`](../../onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md) |
| Work memory    | [`../../onmyagent/docs/design/2026-08-02-work-memory-plan.md`](../../onmyagent/docs/design/2026-08-02-work-memory-plan.md)               |
| Agent handbook | [`../../onmyagent/AGENTS.md`](../../onmyagent/AGENTS.md)                                                                                 |

## Gateway runtime（上游技术 · 仍有效）

| Doc                                    | Description                    |
| -------------------------------------- | ------------------------------ |
| [quickstart.md](quickstart.md)         | Local install and first Action |
| [configuration.md](configuration.md)   | Environment variables          |
| [runtime-api.md](runtime-api.md)       | `/v1`, MCP, OpenAPI            |
| [credentials.md](credentials.md)       | Connections and secrets        |
| [catalog-format.md](catalog-format.md) | Provider catalog format        |
| [verification.md](verification.md)     | Checks and tests               |
| [docker-ghcr.md](docker-ghcr.md)       | Prebuilt images                |
| [cloudflare.md](cloudflare.md)         | Workers（**非 MVP 产品路径**） |
| [fly-io.md](fly-io.md)                 | Fly.io（非 MVP 默认）          |

## 历史归档

| Doc                                                                     | Description                               |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| [upstream/OPENCONNECTOR-README.md](upstream/OPENCONNECTOR-README.md)    | 历史 README 快照                          |
| [upstream/OPENCONNECTOR-AGENTS.md](upstream/OPENCONNECTOR-AGENTS.md)    | 历史 AGENTS（编码细则）                   |
| [README.zh-CN.md](README.zh-CN.md) · [README.zh-TW.md](README.zh-TW.md) | 简体/繁体 README（仅 en / zh-CN / zh-TW） |
