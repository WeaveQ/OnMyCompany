# API 路径约定（与 Connect 共存）

SoT：实现对照 `src/company/routes.ts` + Gateway `ConnectServer`。  
配置体形状：[CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md) · 桌面用法：[DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md) · 阶段：[ROADMAP.md](./ROADMAP.md)。

**状态日**：2026-08-04 · 与 `routes.ts` / gap-close / G0·G1a·G2 对齐。

## 原则

1. 管理面 `/api/*` vs 执行面 `/v1/*` + `/mcp`。  
2. 企业身份 **不** 复用 ops-admin session 语义（cookie `omc_member_session` 或 `Authorization: Bearer <member-token>`）。  
3. Skills 企业目录走 `/api/catalog/skills*` + `/api/org/skills*`（非双写 Actions 目录）。  
4. 策略产品写入 **仅** OrgConfig `PUT /api/org/config/policy` → 同步 runtime-policy（M3a）。企业模式 **禁** Console `PUT /api/runtime-policy`（403 `policy_write_via_org_config`）。  
5. OrgConfig 响应 **无 secret**；与桌面 `profiles/*/config` 可镜像；export/import 同样无 secret。  
6. 企业路径在 `src/server/api/auth.ts` 对 ops-admin middleware **公开**（由 company 自身鉴权）；`/v1` `/mcp` 仍走 runtime 鉴权。

## 鉴权公开前缀（ops-admin middleware 旁路）

| 前缀 / 路径 | 说明 |
|-------------|------|
| `GET /api/company/health` | 公司探活 |
| `/api/company/*` | 企业模块（登录、审计、用量、runtime-token 绑定等） |
| `GET /api/me` · `/api/me/*` | 当前成员 · userdata |
| `/api/org/*` | OrgConfig · members · skills 写 · export/import |
| `/api/catalog/*` | Skills catalog / 分享 |
| `GET /api/policy/effective` | 成员生效策略 |
| `/api/teams*` | 团队（`path.startsWith("/api/teams")` in `auth.ts` isPublicPath） |

> 注：`/api/teams` 由 `registerCompanyRoutes` 注册；ops-admin middleware 旁路后由 **member session** 在 handler 内鉴权（与 `/api/company/*` 相同）。

## 企业层路径（`src/company` · 已实现）

### 探活与身份

| 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/company/health` | ✅ | `companyModule` · orgId · orgConfigRoot · **`modelRouter`**（OmniRoute 边车探测） |
| POST | `/api/company/auth/email/start` | ✅ | 发 OTP；无 SMTP 时响应含 `devCode` |
| POST | `/api/company/auth/email/verify` | ✅ | 校验 OTP；bootstrap 首 admin；返回 token + teams |
| POST | `/api/company/auth/logout` | ✅ | 吊销 member session **并**吊销绑定的 runtime tokens（P5） |
| POST | `/api/company/auth/feishu/start` | ✅ MVP | 返回 authorizeUrl；无 `OMC_FEISHU_APP_ID` 时 mock |
| POST | `/api/company/auth/feishu/verify` | ✅ MVP | stub：openId/code → session；**真 OAuth 换票延期** |
| GET | `/api/me` | ✅ | authenticated · memberId · roles · orgId · **teams[]** |

### OrgConfig 与策略

| 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/org/config/manifest` | ✅ | version / updatedAt |
| GET | `/api/org/config` | ✅ | 整包 snapshot（含 skills enabled 索引） |
| PUT | `/api/org/config/:section` | ✅ | org-admin；`policy` 触发 runtime-policy 同步；写审计 `config.write` |
| GET | `/api/org/config/export` | ✅ C5 | 无 secret 整包导出（admin/auditor） |
| POST | `/api/org/config/import` | ✅ C5 | org-admin 导入 sections；policy 再同步 runtime |
| GET | `/api/policy/effective` | ✅ | 读 Org policy + member 上下文 |

### Skills（S1–S5）

| 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/catalog/skills?scope=org\|public\|mine` | ✅ | 列表；org 按角色过滤 visibleToRoles |
| GET | `/api/catalog/skills/:packageId` | ✅ | 详情 + SKILL.md |
| GET | `/api/catalog/skills/share/:shareToken` | ✅ | 分享链接读（无需登录） |
| POST | `/api/org/skills/enable` | ✅ | org-admin 关联到组织 |
| POST | `/api/org/skills/disable` | ✅ | 取消关联 |
| POST | `/api/org/skills/upload` | ✅ | Markdown 包上传 |
| POST | `/api/org/skills/upload-zip` | ✅ | zip/base64 上传（含 SKILL.md） |
| POST | `/api/org/skills/visibility` | ✅ | 角色可见 |
| POST | `/api/org/skills/share` | ✅ | 生成 shareToken |
| DELETE | `/api/org/skills/:packageId` | ✅ | 删除包 + 启用项 |

### 成员与团队

| 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|
| GET | `/api/org/members` | ✅ W6 | 全局成员列表（含 `status`） |
| POST | `/api/org/members` | ✅ | org-admin 加人；可选 `teamId` |
| PUT | `/api/org/members/:memberId` | ✅ | org-admin：改 `roles` / `status`（active\|deactivated）；停用吊销会话与 runtime tokens |
| DELETE | `/api/org/members/:memberId` | ✅ | org-admin：硬删除账号并吊销会话/token |
| GET | `/api/teams` | ✅ | 当前成员所属团队 |
| POST | `/api/teams` | ✅ | 创建团队（name: 英数._-） |
| GET | `/api/teams/:teamId` | ✅ | 团队详情 + 本人 membership |
| PUT | `/api/teams/:teamId` | ✅ | 编辑名称/头像 |
| GET | `/api/teams/:teamId/members` | ✅ | 团队成员表（角色/状态/连接文案） |
| POST | `/api/teams/:teamId/members` | ✅ | 团队加人（可先建组织账号） |
| PUT | `/api/teams/:teamId/members/:memberId` | ✅ | 改团队内角色等（team-admin / org-admin） |
| DELETE | `/api/teams/:teamId/members/:memberId` | ✅ | 移出团队 |

### 归因 · 审计 · 用量 · 概览 · 计量（G2）

| 方法 | 路径 | 状态 | 说明 |
|------|------|------|------|
| POST | `/api/company/runtime-tokens` | ✅ | 铸造 runtime token 并绑定 memberId |
| POST | `/api/company/runtime-tokens/bind` | ✅ | 绑定已有 tokenId → member |
| GET | `/api/company/audit/events` | ✅ A2 | 登录/配置/member.*；admin/auditor；控制台 `/audit-events`；`?type=&limit=` |
| GET | `/api/company/audit/export` | ✅ | `format=jsonl\|csv`；`kind=runs\|events` |
| GET | `/api/company/usage` | ✅ G2 | **工具**用量；时间窗 `from`/`to`、可选 `memberId`/`teamId`/`service`/`limit`；KPI + byDay + **fallbackRuns** |
| GET | `/api/company/usage/llm` | ✅ B | **LLM**用量代理 OmniRoute `GET /api/usage/history`；可选 `from`/`to`；与工具用量分账 |
| GET | `/api/company/pricing` | ✅ G2 | 参考价目；`?source=auto\|omniroute\|static`；**LLM 默认可从 OmniRoute `/api/pricing` 拉**，工具价始终本地；响应含 `source` / `omniroute` |
| GET | `/api/company/runs` | ✅ G2 | 计量日志（**成员会话**）；勿用 ops `/api/runs` 作产品主路径 |
| GET | `/api/company/overview` | ✅ | 配置 version · 成员数 · Skills · 策略拒绝 |
| GET | `/api/me/userdata` | ✅ | 成员 UserData 袋 |
| PUT | `/api/me/userdata` | ✅ | merge 写 UserData |

## Gateway / Connect 路径（并存 · 未改语义）

| 域 | 路径 | 状态 |
|----|------|------|
| 探活 | `GET /health` | ✅ |
| ops session | `GET /api/auth/session` · logout | ✅ ops-admin |
| Actions / Providers | `/api/actions*` · `/api/providers*` | ✅；office 配置文件会过滤 providers 列表 |
| Runtime tokens（控制台） | `/api/runtime-tokens*` | ✅ |
| Runtime policy 读写 | `/api/runtime-policy` | ✅ ops；**企业模式写禁**（走 OrgConfig） |
| Connections / OAuth | `/api/connections*` · `/api/oauth/*` | ✅ 组织共享 |
| Runs | `/api/runs*` | ✅；`memberId` 在绑定 token 执行后可填 |
| 执行 | `POST /v1/actions/:id` · `/mcp` | ✅ runtime token / JWT |

### 执行面护栏与主备（G0 / G1a · 已落地）

| 能力 | 说明 | 落点 |
|------|------|------|
| **G0 并发帽** | 全局 + 每 member in-flight；超限 **429** `rate_limited` + `Retry-After` | `concurrency-guard.ts` · `OMC_MAX_IN_FLIGHT*` |
| **G1a Connection 主备** | 同 service 多 connectionName 时按序尝试；可重试错误切备路；cooldown | `connection-fallback.ts` · action-runner |
| **Run 字段** | `attempt` · `fallback` · `connectionName` / `connectionId` · `memberId` | run log / 计量导出 |

计量口径：**只统计经 Gateway 的 Action/MCP**（非默认 LLM 反代）。详见 [GATEWAY-OBSERVABILITY-PLAN.md](./GATEWAY-OBSERVABILITY-PLAN.md)。

### Catalog 表面（office 默认）

| 变量 / 模块 | 说明 |
|-------------|------|
| `OMC_CATALOG_PROFILE=office\|full` | 默认 **office** 白名单（办公 + AI + 国内补充 + no_auth「可直接使用」） |
| `OMC_ALLOWED_SERVICES` | 逗号列表或 `*` 覆盖 profile |
| 代码 | `src/core/office-catalog.ts` · `loadCatalog(..., { allowedServices })` |
| 控制台「文档」chip | `web` 按 service id 映射（Drive/Docs 常标 Productivity） |
| 控制台「可直接使用」 | `authTypes` 含 `no_auth` 的 provider（如 hackernews、arxiv） |

完整 OpenConnector 目录 1000+；产品默认约 **70** 个办公相关 service（以实际 catalog 命中为准）。

## 明确延期（勿写成主路径缺口）

| 项 | 说明 |
|----|------|
| 真飞书 OAuth 换票 | 现 stub；需 `OMC_FEISHU_*` 与回调落地 |
| SMTP 生产运营 | `OMC_SMTP_URL` 可选已支持；无模板/监控主路径 |
| Catalog experts/models 独立资源 API | 仍经 OrgConfig sections / 桌面镜像 |
| G1b LLM 逻辑路由 / Plan 池 | 默认关；产品升格后才做 |
| G3 软配额 | 可选后置 |
| OpenAPI 企业路径全量录入 | Gateway 见 `docs/runtime-api.md`；企业表以本文为准 |

## PolicyDecision（执行面）

```json
{
  "allowed": false,
  "code": "action_blocked",
  "message": "...",
  "checks": [
    { "source": "runtime", "outcome": "block_match", "rule": "..." }
  ]
}
```

`source` ∈ `deployment` | `runtime` | `token`（Gateway 分层）。Org 策略经 M3a 进入 runtime 层。

## 执行 actor

- 登录后 `POST /api/company/runtime-tokens` 绑定 `memberId`。  
- `/v1` / MCP 解析 grant 时附带 `memberId` → `RunLog.memberId`。  
- 审计导出含 `memberId` 列；usage 含 `fallbackRuns`。

## 校验

```bash
node scripts/check-docs-api-notes.mjs
```

要求 `routes.ts` 中非参数化路径均出现在本文。
