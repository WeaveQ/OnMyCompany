---
title: 策略、配额与 API Key
---

# 策略、配额与 API Key

组织策略只在 **企业设置** 写一次，保存后合成运行时策略。runtime token 是任意 Agent 调 `/v1` / `/mcp` 的钥匙，必须绑到成员。

产品入口：侧栏 **企业设置** `/org-config`、**API Key** `/access`、**文档** `/resources`。

## 1. 和「…」有什么区别

|                                    | 企业设置里的策略                          | API Key 页                           | 环境变量 `OMC_ALLOWED_ACTIONS` |
| ---------------------------------- | ----------------------------------------- | ------------------------------------ | ------------------------------ |
| 谁写                               | 企业管理员                                | 控制台铸造 token；分层策略查看       | 运维改 `.env`                  |
| 作用范围                           | 全组织，合成 runtime-policy               | 单个 token 可再收窄                  | 进程级硬顶                     |
| 企业模式直写 `/api/runtime-policy` | 禁止（403 `policy_write_via_org_config`） | 页上若仍有「保存运行时策略」，会失败 | 与策略叠加                     |

三层都会生效。组织允许但 ENV 封了，仍然不能跑。

## 2. 企业设置里写什么

| 字段          | 含义                                                 |
| ------------- | ---------------------------------------------------- |
| 允许的 Action | 逗号分隔，支持 `*`、`github.*`                       |
| 禁止的 Action | 同样通配                                             |
| 敏感外发模式  | `必须走公司网关` / `优先走公司网关` / `允许本机直连` |
| 允许个人 BYOK | 员工能否继续用自己的模型 Key                         |
| 工具调用配额  | 人 / 队 × 日 / 月。管 Gateway 次数，不管模型 token   |
| 高级 JSON     | 同一份 `policy`，给需要贴整包的人                    |

egress 与桌面契约对应：

| 界面           | 代码                | 员工侧含义                                              |
| -------------- | ------------------- | ------------------------------------------------------- |
| 必须走公司网关 | `gateway_required`  | 敏感类不得拿本机 secret 直连。桌面全 runtime 强制仍未满 |
| 优先走公司网关 | `gateway_preferred` | 能走网关则走网关                                        |
| 允许本机直连   | `local_ok`          | 本机直连不被组织禁止                                    |

配额留空表示不限制。超限返回 `429` `quota_exceeded`。模型 token 限额在 OmniRoute，不要写进这四个格子。

企业管理员还可以 **导出配置 JSON**（无连接密钥）。导入走 API `POST /api/org/config/import`，管理台按钮以页面为准。

审计、员工打开本页是只读。

## 3. API Key（runtime token）

**API Key** 页铸造的是执行面 bearer，不是成员登录验证码。

| 操作       | 说明                                          |
| ---------- | --------------------------------------------- |
| 创建       | 起名，可选再加一层 token 策略。明文只显示一次 |
| 复制       | 立刻存到密钥柜。关掉对话框就没了              |
| 吊销       | 立即失效                                      |
| 权限测试器 | 预览某 Action / 代理是否被当前层允许          |

企业路径下，成员绑定的铸造口是 `POST /api/company/runtime-tokens`。登出成员或停用账号会吊销其绑定 token。Agent 会突然 401，需要重新签发。

给 curl / MCP 用时，把 token 放在 `Authorization: Bearer …`。按队归因再加：

```http
Authorization: Bearer <runtime-token>
X-Team-Id: <team-id>
```

没有连接授权名单时，不带头仍可能跑成功，但 run 没有 `teamId`，按队过滤会漏。该连接已有非空授权名单时，缺 `X-Team-Id` 与未授权队一样，返回 `403` `connection_team_denied`。

**文档** 页可以复制 MCP URL（`http://127.0.0.1:3100/mcp`）和带 Bearer 的 JSON，并打开 Scalar（`/docs`）与 `openapi.json`。

## 4. 任意 Agent 怎么调

```bash
# 探活
curl -s http://127.0.0.1:3100/health

# 执行
curl -s -X POST http://127.0.0.1:3100/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer <runtime-token>" \
  -d '{"input":{}}'
```

列出可执行 Action：`GET /v1/actions`。单个说明：`GET /api/actions/<id>/agent.md`。

并发帽（G0）：全局默认 100、每成员默认 10，超限 `429` `rate_limited`，带 `Retry-After`。

## 5. 使用建议

1. 试点允许列表从具体服务写起，例如 `hackernews.*,github.get_current_user`，少用光秃秃的 `*`。
2. 只在企业设置点「保存策略」。不要在 API Key 页改组织策略。
3. 把 runtime token 当密码。不要贴进截图、录像、公开工单。
4. 需要收回某人工具权：停用账号或吊销其 token，比改队名快。

## 6. 常见状态

| 状态                          | 含义                              | 建议                        |
| ----------------------------- | --------------------------------- | --------------------------- |
| `policy_write_via_org_config` | 走了禁止的直写口                  | 回企业设置                  |
| Action 被拒                   | 组织禁止、token 层禁止或 ENV 封禁 | 看返回 `message` / `checks` |
| `quota_exceeded`              | 工具次数用完                      | 改配额或等窗口              |
| 保存策略后桌面仍像没变        | 镜像未拉到新 version              | 桌面重新进前台或再登录      |
| 导出 JSON 里没有 Key          | 设计如此                          | 密钥不在 OrgConfig          |

## 7. 相关

- [连接器与网关](./connections.md) · [员工与桌面](./desktop.md)
- 配置树：[CONFIG-SCHEMA.md](/onmycompany/CONFIG-SCHEMA)
- 路径表：[API-NOTES.md](/onmycompany/API-NOTES)
