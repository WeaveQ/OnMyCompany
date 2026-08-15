---
title: 快速开始
---

# 快速开始

约 15 分钟走通：启动 → 解锁 → 首个企业管理员 → 加一个人 → 跑通一次 `/v1`。

产品入口：仓库根目录 `npm run dev`，然后打开管理台 `http://127.0.0.1:5180`。

## 1. 你将完成

1. API `:3100` 与管理台 `:5180` 起来
2. 打开控制台（未设运维 token 时直接进；设了则先解锁）
3. 用 bootstrap 邮箱登录，成为企业管理员
4. 加一名员工账号
5. 用 runtime token 调一次无鉴权 Action（Hacker News）

模型边车 OmniRoute 是可选项。本页不配飞书 SSO，那条路径仍是 stub。

## 2. 准备

- Node.js 22.18+（推荐 24）
- 本机端口 `3100`、`5180` 空闲（桌面 OnMyAgent 开发占用 `5173`，不要挤）
- 复制环境文件：

```bash
cp .env.example .env
```

试点至少看这几项（写在 `.env`，不要提交真实密钥）：

| 变量                        | 作用                             |
| --------------------------- | -------------------------------- |
| `PORT=3100`                 | API 端口。管理台默认反代到这里   |
| `OMC_DATA_DIR=./data`       | SQLite 与组织配置目录            |
| `OMC_BOOTSTRAP_ADMIN_EMAIL` | 空库第一个企业管理员邮箱         |
| `OMC_DEV_OTP=000000`        | 本地固定验证码                   |
| `OMC_ADMIN_TOKEN`           | 运维解锁控制台。不设则控制台不锁 |
| `OMC_ENCRYPTION_KEY`        | 加密连接密钥。正式试点必须设     |

默认目录是 office 画像（约 70 个办公相关应用）。不要一上来开 `OMC_CATALOG_PROFILE=full`。

## 3. 启动

```bash
npm install
npm run dev
```

| 入口              | 地址                                             |
| ----------------- | ------------------------------------------------ |
| 探活              | http://127.0.0.1:3100/health                     |
| 企业探活          | http://127.0.0.1:3100/api/company/health         |
| 管理台            | http://127.0.0.1:5180                            |
| OpenAPI / Scalar  | http://127.0.0.1:3100/docs                       |
| OmniRoute（可选） | http://127.0.0.1:20128 · `npm run dev:omniroute` |

`GET /health` 应返回 `{"ok":true}`。

旧文档和部分 curl 示例仍写 `:3000`，以 `.env` 的 `PORT` 和当前进程为准。本地 `npm run dev` 是 **3100**。

## 4. 打开管理台

1. 浏览器打开 `http://127.0.0.1:5180`，默认落到 **概览**。
2. 若出现「解锁控制台」，填 `OMC_ADMIN_TOKEN`。这是**平台运维**身份，不是企业管理员。
3. 未设 `OMC_ADMIN_TOKEN` 时壳直接打开，并打一条告警：管理鉴权关闭。只适合本机。

概览上的 **Admin onboarding** 清单（英文标题）顺序是：企业账号 → 团队 → 连接器 → Skills → 外发策略 → 模型路由 → runtime token。跟着点即可。清单不能关掉，完成态有时偏乐观，以各页真实数据为准。

## 5. 成为第一个企业管理员

空花名册时，`OMC_BOOTSTRAP_ADMIN_EMAIL`（`.env.example` 默认 `admin@company.internal`）第一次验证码成功，就会带上 `admin`。

1. 打开 **企业账号** 或 **企业设置**。本地控制台已解锁时，常会静默用 `admin@company.internal` / `000000` 建会话。
2. 若出现登录卡：邮箱填 bootstrap 邮箱，验证码填 `OMC_DEV_OTP`（默认 `000000`）。
3. 登录成功会自动有一个默认团队，供顶栏团队切换器使用。
4. 之后禁止自助注册。加人只能走企业管理员（或团队管理员从花名册拉人）。

也可以用 curl：

```bash
curl -s -X POST http://127.0.0.1:3100/api/company/auth/email/start \
  -H 'content-type: application/json' \
  -d '{"email":"admin@company.internal"}'

curl -s -X POST http://127.0.0.1:3100/api/company/auth/email/verify \
  -H 'content-type: application/json' \
  -d '{"email":"admin@company.internal","code":"000000"}'
```

第二次起，把返回的 `token` 当作成员会话。生产若配了 `OMC_SMTP_URL`，验证码发到邮箱，响应里不一定再带 `devCode`。

## 6. 加一名员工

1. 打开 **企业账号** `/members`。
2. 添加：邮箱、显示名、企业角色（员工 / 企业管理员 / 企业审计）。
3. 新人状态是 **Pending**，对方第一次登录后才变 Active。
4. 打开 **团队**，从企业账号池把人拉进队。只建花名册、不入队，对方没有小队上下文。

最后一个企业管理员不能停用或删除。

## 7. 跑通一次 Gateway

Hacker News 不需要密钥，适合确认执行面活着。无鉴权 Action 在未配 runtime token 的本机开发里通常也能跑：

```bash
curl -s -X POST http://127.0.0.1:3100/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

给员工或外部 Agent 用时，到 **API Key** `/access` 铸造 runtime token，只显示一次：

```bash
curl -s -X POST http://127.0.0.1:3100/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <runtime-token>" \
  -d '{"input":{}}'
```

MCP 地址在 **文档** `/resources`：`http://127.0.0.1:3100/mcp`。

办公应用（GitHub、飞书等）走 **连接器**，密钥写在提供商页，见 [连接器与网关](./connections.md)。

## 8. 下一步

| 目标                        | 去哪                                |
| --------------------------- | ----------------------------------- |
| 分清运维 token 和企业管理员 | [控制台与角色](./console.md)        |
| 花名册与入队                | [企业账号与团队](./accounts.md)     |
| 写下发规矩                  | [策略、配额与 API Key](./policy.md) |
| 让员工连桌面                | [员工与桌面](./desktop.md)          |
| 查用量和谁改了什么          | [计量、运行与审计](./observe.md)    |

## 9. 相关

- [使用说明首页](./index.md) · [排障与边界](./faq.md)
- 环境变量全表：[ENV.md](/onmycompany/ENV)
- 首登与双 Admin：[BOOTSTRAP.md](/onmycompany/BOOTSTRAP)
