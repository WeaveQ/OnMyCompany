# 环境变量命名（OMC\_\*）

| Field  | Value                                                                           |
| ------ | ------------------------------------------------------------------------------- |
| Status | **Canonical** — 产品统一用 `OMC_*`                                              |
| Legacy | 兼容别名 `OOMOL_CONNECT_*` 仍作 **fallback 读取**（兼容旧部署 / 旧 compose）    |
| Code   | `src/server/env.ts` · 企业-only 见 `OMC_PRODUCT_ENV` / 直接 `process.env.OMC_*` |

## 1. 规则

1. **新配置、文档、docker、示例只写 `OMC_*`。**
2. 运行时读取顺序：`OMC_*` →（若空）`OOMOL_CONNECT_*`。
3. 错误日志 / 提示文案只提 **`OMC_*`**。
4. 企业扩展变量 **只有** `OMC_*`（无旧前缀）。
5. 产品文档与示例只写 `OMC_*`；兼容别名仅由 `env.ts` 读取，勿在新配置中继续写别名。

## 2. 对照表（Gateway / 运行时）

| OnMyCompany（canonical）       | 兼容别名（废弃中）                       | 默认                      | 用途                                        |
| ------------------------------ | ---------------------------------------- | ------------------------- | ------------------------------------------- |
| `PORT`                         | 同名                                     | `3000`                    | HTTP 端口                                   |
| `HOST`                         | 同名                                     | `127.0.0.1`               | 绑定地址；Docker 常用 `0.0.0.0`             |
| `OMC_ORIGIN`                   | `OOMOL_CONNECT_ORIGIN`                   | `http://localhost:<PORT>` | 公网 origin（OAuth redirect）               |
| `OMC_DATA_DIR`                 | `OOMOL_CONNECT_DATA_DIR`                 | `./data`                  | SQLite + files + org config 根              |
| `OMC_ENCRYPTION_KEY`           | `OOMOL_CONNECT_ENCRYPTION_KEY`           | unset                     | 凭据 / OAuth / 幂等响应加密                 |
| `OMC_NEW_ENCRYPTION_KEY`       | `OOMOL_CONNECT_NEW_ENCRYPTION_KEY`       | unset                     | `runtime:data rotate-key` 新密钥            |
| `OMC_ADMIN_TOKEN`              | `OOMOL_CONNECT_ADMIN_TOKEN`              | unset                     | **ops-admin** bearer                        |
| `OMC_RUNTIME_TOKEN`            | `OOMOL_CONNECT_RUNTIME_TOKEN`            | unset                     | 可选 bootstrap runtime token（`/v1` · MCP） |
| `OMC_JWKS_URI`                 | `OOMOL_CONNECT_JWKS_URI`                 | unset                     | Runtime JWT JWKS（Node）                    |
| `OMC_JWT_ISSUER`               | `OOMOL_CONNECT_JWT_ISSUER`               | unset                     | JWT `iss`                                   |
| `OMC_JWT_AUDIENCE`             | `OOMOL_CONNECT_JWT_AUDIENCE`             | unset                     | JWT `aud`                                   |
| `OMC_ALLOWED_ACTIONS`          | `OOMOL_CONNECT_ALLOWED_ACTIONS`          | unset                     | Action allowlist（`service.*` / `*`）       |
| `OMC_BLOCKED_ACTIONS`          | `OOMOL_CONNECT_BLOCKED_ACTIONS`          | unset                     | Action denylist                             |
| `OMC_ALLOWED_PROXIES`          | `OOMOL_CONNECT_ALLOWED_PROXIES`          | unset                     | Proxy allowlist                             |
| `OMC_BLOCKED_PROXIES`          | `OOMOL_CONNECT_BLOCKED_PROXIES`          | unset                     | Proxy denylist                              |
| `OMC_ALLOW_PRIVATE_NETWORK`    | `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`    | `false`                   | 自托管 provider 访问内网                    |
| `OMC_LOG_LEVEL`                | `OOMOL_CONNECT_LOG_LEVEL`                | `info`                    | Pino 级别                                   |
| `OMC_TRANSIT_FILE_TTL_SECONDS` | `OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS` | `86400`                   | 中转文件 TTL                                |
| `OMC_TRANSIT_FILE_MAX_BYTES`   | `OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES`   | `104857600`               | 中转文件上限                                |
| `OMC_RUN_LIMIT`                | `OOMOL_CONNECT_RUN_LIMIT`                | `5000`                    | runs 保留条数                               |
| `OMC_CATALOG_PROFILE`          | `OOMOL_CONNECT_CATALOG_PROFILE`          | `office`                  | `office` 白名单 / `full` 全量 catalog       |
| `OMC_ALLOWED_SERVICES`         | `OOMOL_CONNECT_ALLOWED_SERVICES`         | unset                     | 逗号 service id 或 `*`（覆盖 profile）      |

## 2b. 网关护栏 / fallback（G0 · G1a）

| 变量                           | 默认  | 用途                                                            |
| ------------------------------ | ----- | --------------------------------------------------------------- |
| `OMC_MAX_IN_FLIGHT`            | `100` | 全局并发执行上限（`/v1/actions` · `/v1/proxy` · `/mcp` 写请求） |
| `OMC_MAX_IN_FLIGHT_PER_MEMBER` | `10`  | 每 member（或 token/IP）并发上限                                |

> 注：`OMC_MAX_IN_FLIGHT*` 目前由 `concurrency-guard.ts` **直接读 `process.env`**（不经 `env.ts` 双读表）；新部署请只写 `OMC_*`。

超限返回 **429** `rate_limited`，并带 `Retry-After: 2`。

Connection 主备（G1a）默认启用：同 service 多连接时自动排序尝试；cooldown 内置（见 `connection-fallback.ts`），暂无独立 ENV。

## 3. 企业扩展（仅 OMC\_\*）

| 变量                         | 状态    | 用途                                        |
| ---------------------------- | ------- | ------------------------------------------- |
| `OMC_BOOTSTRAP_ADMIN_EMAIL`  | ✅      | 空库首个 org-admin 邮箱                     |
| `OMC_DEV_OTP`                | ✅      | 本地固定 OTP（默认 `000000`）               |
| `OMC_SMTP_URL`               | ✅ 可选 | 发 OTP 邮件；未设则用 devCode               |
| `OMC_SMTP_FROM`              | ✅ 可选 | 发件人                                      |
| `OMC_EXPOSE_DEV_OTP`         | ✅ 可选 | SMTP 已发时仍回传 code（调试）              |
| `OMC_FEISHU_APP_ID`          | ⏳ stub | 飞书 authorize 参数；真换票延期             |
| （预留）`OMC_ORG_CONFIG_DIR` | 可选    | 覆盖默认 `$OMC_DATA_DIR/org/default/config` |

## 4. Catalog 表面（办公默认）

| 配置                                     | 效果                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| 不设 / `OMC_CATALOG_PROFILE=office`      | 加载 `OFFICE_CATALOG_SERVICES`（办公协作 + 国内 + AI + no_auth 公共源） |
| `OMC_CATALOG_PROFILE=full`               | 不按 service 过滤（完整 OpenConnector 应用表）                          |
| `OMC_ALLOWED_SERVICES=gmail,notion,*` 等 | **覆盖** profile；`*` / `all` = 全量                                    |

实现：`src/core/office-catalog.ts` · 启动日志 `catalog filtered to office/productivity allowlist`。

本地推荐：

```bash
OMC_CATALOG_PROFILE=office   # 默认
# OMC_CATALOG_PROFILE=full
# OMC_ALLOWED_SERVICES=hackernews,gmail,notion,feishu
```

## 5. 本地推荐最小集

```bash
export OMC_DATA_DIR="$PWD/data"
export OMC_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export OMC_ADMIN_TOKEN="$(openssl rand -hex 24)"
export OMC_BOOTSTRAP_ADMIN_EMAIL="admin@company.internal"
export OMC_DEV_OTP="000000"
export OMC_ALLOWED_ACTIONS="hackernews.*,github.get_current_user"
export OMC_CATALOG_PROFILE=office
export OMC_LOG_LEVEL=info
npm run dev
```

或 `cp .env.example .env` 后编辑。

## 6. Docker

```yaml
environment:
  OMC_DATA_DIR: /app/data
  OMC_ORIGIN: https://oma.internal
  OMC_ENCRYPTION_KEY: "…"
  OMC_ADMIN_TOKEN: "…"
  OMC_CATALOG_PROFILE: office
```

Dockerfile 默认：`ENV OMC_DATA_DIR=/app/data`。

## 7. 迁移说明

| 场景                              | 做法                                 |
| --------------------------------- | ------------------------------------ |
| 新部署                            | 只设 `OMC_*`                         |
| 旧 compose 仍写 `OOMOL_CONNECT_*` | 暂时可跑（fallback）；应改成 OMC\_\* |
| 两边都设                          | **以 OMC\_\* 为准**                  |
| 合外部源                          | 保留 `env.ts` fallback               |

## 8. 废弃时间表

| 阶段     | 动作                                 |
| -------- | ------------------------------------ |
| **现在** | 文档 + 代码读 OMC 优先；文档只写 OMC |
| 试点后   | 可删 fallback（另开变更）            |

## 9. Changelog

| Date       | Note                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-08-03 | 定稿 `OMC_*`；映射表；`src/server/env.ts` 双读                                |
| 2026-08-04 | `OMC_CATALOG_PROFILE` / `OMC_ALLOWED_SERVICES`；G0 `OMC_MAX_IN_FLIGHT*`       |
| 2026-08-05 | OmniRoute 边车：`OMC_OMNIROUTE_URL` / `V1` / `DASHBOARD_URL`（B+D，进程分离） |

## 10. OmniRoute 边车（B+D）

| 变量                          | 默认                     | 用途                                         |
| ----------------------------- | ------------------------ | -------------------------------------------- |
| `OMC_OMNIROUTE_URL`           | `http://127.0.0.1:20128` | 边车根；健康探测                             |
| `OMC_OMNIROUTE_V1`            | `{URL}/v1`               | Agent chat baseUrl / models.json             |
| `OMC_OMNIROUTE_DASHBOARD_URL` | `{URL}/dashboard`        | 管理台外链                                   |
| `OMC_OMNIROUTE_ENABLED`       | `true`                   | 设 `0`/`false` 关闭探测与展示                |
| `OMC_OMNIROUTE_ADMIN_KEY`     | unset                    | 拉取 Omni `/api/pricing` 时的 Bearer（可选） |
| `OMC_OMNIROUTE_PRICING_PATH`  | `/api/pricing`           | 价目路径                                     |
| `OMC_PRICING_SOURCE`          | `auto`                   | `auto` / `omniroute` / `static`              |
| `OMC_OMNIROUTE_PRICING`       | `1`                      | `0`/`false` 强制本地 LLM 价目                |

详见 [OMNIROUTE-SIDECAR.md](./OMNIROUTE-SIDECAR.md)。
