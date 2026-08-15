# OnMyCompany 开发计划

| Field  | Value                                                                    |
| ------ | ------------------------------------------------------------------------ |
| Status | **active** · 2026-08-15                                                  |
| 仓     | 本仓（`onmycompany`）                                                    |
| 对端   | [OMA-DEV-PLAN.md](./OMA-DEV-PLAN.md)                                     |
| 来源   | OpenOcta Server 管理端对照 + 已有 ROADMAP / TEAM-ISOLATION / SKILLS-PLAN |
| 工作量 | 熟仓 1 人；`XS` ≤0.5d · `S` 1–2d · `M` 3–5d · `L` 6–10d                  |

---

## 1. 一句话

管理台补开局、资源 ACL 和专家/MCP 目录。模型（厂商、Key、联通、限额、LLM 用量）走 OmniRoute，OMC 只外链和探活，不复制一套模型后台。

公司端写真相：OrgConfig、连接、策略、配额、授权。桌面只消费镜像，见对端计划。

---

## 2. 边界（不可回退）

| ID     | 规则                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 产品   | 只做身份 / OrgConfig / Gateway / 策略 / 审计 / 管理台。员工对话在 OMA。                                                      |
| 配置   | local / company 同一 schema。OrgConfig 是公司真相；桌面 `profiles/company/config` 只是镜像。                                 |
| 策略   | 只写 `PUT /api/org/config/policy`，再合成 runtime-policy。                                                                   |
| Secret | config 与导出不含密钥。模型 Key 只在 OmniRoute，连接密钥只在 OMC。                                                           |
| 模型   | Chat 不经 OMC（非 G1b）。管理台「模型路由」外链 Omni dashboard。`models.json` 只是给桌面的推荐目录（无 Key），不是模型后台。 |
| 连接   | MVP 仍是组织共享。按队授权是本计划第二轮，不是每队一套私有库。                                                               |
| 不做   | 公网多租户、G1b 默认反代、企业审批主路径、托管工作区、chat-to-cloud。                                                        |

契约变更：先改 [DESKTOP-CONTRACT](../onmycompany/DESKTOP-CONTRACT.md) · [CONFIG-SCHEMA](../onmycompany/CONFIG-SCHEMA.md) · [API-NOTES](../onmycompany/API-NOTES.md)，再改代码。不要改 OMA 桌面主路径。

---

## 3. 已落地（本计划不重做）

| 块                                                | 状态                                 |
| ------------------------------------------------- | ------------------------------------ |
| Gateway G0 / G1a / G2                             | 已落地                               |
| 企业账号 / 团队 IA / last-admin                   | 已落地                               |
| Skills 关联、zip/md 上传、`visibleToRoles` API    | 已落地（UI 仍是 `prompt()`）         |
| 审计事件、计量、运行记录、API Key                 | 已落地                               |
| 连接器 office catalog、密钥不回显                 | 已落地                               |
| 企业设置：策略表单 + 模型 JSON + 导出             | 已落地。模型主路径在 Omni，JSON 够用 |
| 模型路由外链 + health.modelRouter + 计量 LLM←Omni | 已落地（见 OMNIROUTE-SIDECAR）       |
| 桌面 2b 最小客户端可拉 `/api/org/config`          | 已落地（执行面见 OMA 计划）          |

`ORG-TEAM-PLAN` Phase 2.5 的 last-admin 保护已经在 `TEAM-ISOLATION` / `RBAC` 勾完，不要再立项。

---

## 4. 三轮任务

### 第一轮 · 开局能走完（6–8d）

Skills 角色可见性有正规控件，专家包能在管理台启停。模型不在本轮做后台。

| ID    | 任务                                                                                                                             | 落点                                      | 量      | 验收                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| OMC-1 | 概览开局清单：企业账号 → 队 → 连接 → Skills → 策略 → **模型路由（Omni）** → runtime token → curl/`/v1`                           | `web/src/overview-page.tsx`               | S       | 清单里「模型」一步只检查 Omni 探活（`health.modelRouter.ok`）并链到侧栏「模型路由」，不要求在企业设置里登模型 |
| OMC-2 | ~~模型目录改表单~~ **降级为可选**：企业设置保留一行「模型在 OmniRoute」+ 已有外链/探活。不要做厂商卡片、Key、联通测试、Embedding | `org-config-page.tsx` 文案即可            | XS 或砍 | Key 不进 OrgConfig；管理员配模型只打开 Omni dashboard                                                         |
| OMC-3 | Skills `visibleToRoles` 改成多选，去掉 `window.prompt`                                                                           | `skills-page.tsx`                         | S       | 设 `admin` 后普通成员的 org catalog 不可见；单测已覆盖（`audit-productization`）                              |
| OMC-4 | 专家包列表页：启用 / 移除 / 只读详情。不要「点对话」                                                                             | 新 `experts-page.tsx` + `config/experts/` | M       | 启用后 `GET /api/org/config` 的 experts 与桌面镜像一致；无聊天按钮                                            |
| OMC-5 | 一页「成员开局」说明（登录公司后桌面该看见什么）                                                                                 | `docs/onmycompany/` 短文或管理端链出      | XS      | 成员能按文完成 OMA 公司设置，不依赖工作台                                                                     |

**本轮不改契约路径。** OMC-4 复用已有 `experts/installed`，禁止新 schema。

### 第二轮 · 权限粒度（6–9d）

连接不再是全公司一把钥匙。执行能按队归因，配额能拒绝。

| ID    | 任务                                                                  | 落点                                    | 量  | 验收                                                                    |
| ----- | --------------------------------------------------------------------- | --------------------------------------- | --- | ----------------------------------------------------------------------- |
| OMC-6 | 按角色藏侧栏写入口（审计只读）                                        | `web/src/ui.tsx`                        | S   | auditor 看不见企业账号写、企业设置保存、Skills 添加；API 仍 403         |
| OMC-7 | `/v1` 与 `/mcp` 读 `X-Team-Id`，run 写入 `teamId`                     | `src/server/` · `API-NOTES`             | S   | 带头发的 run 可按队过滤；不带头仍可跑，进「未归属」                     |
| OMC-8 | `connection_team_grants`：存表、列表过滤、执行前校验、连接行授权给队  | `src/company/` · `connections-page.tsx` | M–L | 未授权队调用该连接 → deny；全公司视角仍看全部连接                       |
| OMC-9 | G3 软配额：member/team × 日/月 **工具 run 数**（有 token 再用 token） | policy 或独立配额配置 · G2 聚合         | M   | 只管经 Gateway 的外发。模型 token 限额留在 Omni，两本账不要合成一套配额 |

OMC-8 先改 [API-NOTES](../onmycompany/API-NOTES.md) 和 [TEAM-ISOLATION](../onmycompany/TEAM-ISOLATION.md)。桌面必须带 `X-Team-Id`，见 OMA-7 / OMA-8。

队级 policy 叠加、历史 run「未归属」独立桶、显式 `owner` 角色：**本轮不做**（`TEAM-ISOLATION` 后续）。

### 第三轮 · 资源面（5–8d）

| ID     | 任务                                                   | 落点                    | 量  | 验收                                              |
| ------ | ------------------------------------------------------ | ----------------------- | --- | ------------------------------------------------- |
| OMC-10 | Skills 详情：读 SKILL.md、版本、谁添加                 | catalog detail API + 页 | S   | 管理台能打开正文；无可视化编排                    |
| OMC-11 | MCP / 工具目录页（读 `tools/mcp.json` + gateway 投影） | 新页或企业设置子页      | S–M | 只声明与健康；公司进程不 `npx` 拉起 MCP           |
| OMC-12 | 命名配置引用：Skill 写别名，导出/投影时服务端展开      | 连接字段别名 · 导出路径 | M   | 镜像与桌面看不到 secret；未展开的引用不得下发明文 |

---

## 5. 后置（有客户再开）

| ID     | 项                                                | 量  | 备注                                                       |
| ------ | ------------------------------------------------- | --- | ---------------------------------------------------------- |
| OMC-13 | 飞书等作为 **连接器** 真 OAuth                    | M   | 现在 stub。是「Agent 调飞书 API」，不是 IM 聊天通道        |
| OMC-14 | SSO（OIDC）                                       | L   | 邮箱 OTP 之外                                              |
| OMC-15 | 飞书 **登录公司**（`/api/company/auth/feishu/*`） | M   | 与 OMC-13 不是同一件事                                     |
| OMC-16 | G1b 逻辑模型反代                                  | L   | 默认关。模型已在 Omni 就 **不要** 为了追 OpenOcta 再做 G1b |
| —      | Skills S5：审批上架、商店、外链、病毒扫描         | —   | 保持后置                                                   |
| —      | `/api/me/skills` 个人备份                         | —   | UserData，M7                                               |

---

## 6. 明确不做

| 项                                            | 原因                                      |
| --------------------------------------------- | ----------------------------------------- |
| 浏览器工作台 / 新对话 / 本轮资源              | 工作台在 OMA                              |
| 知识库向量化、命中测试                        | 记忆正文不进 OrgConfig                    |
| 企业审批队列                                  | 契约：非主路径                            |
| 智能体节点 / Sophon / gRPC 集群               | 运行面是单进程 Gateway                    |
| 数字员工「点了就在公司里聊」                  | 专家包只下发                              |
| 管理台填写模型 API Key / 厂商联通 / Embedding | 已由 Omni 承担；再做就是第二套模型后台    |
| 按用户授模型权、模型 token 限额               | Omni dashboard；OMC 只做工具配额（OMC-9） |
| 定时任务、个人文件仓库、从对话提炼 Skill      | OpenOcta 工作台能力                       |

---

## 7. 与 OMA 的接口

| OMC 交付                                                    | OMA 消费                         |
| ----------------------------------------------------------- | -------------------------------- |
| `GET /api/org/config` 含 models / experts / skills / policy | 镜像到 `profiles/company/config` |
| `visibleToRoles` 过滤后的 catalog                           | 成员拉到的就是可见集             |
| `X-Team-Id` + 连接授权 deny                                 | 请求带头；展示 `PolicyDecision`  |
| G3 超限 4xx                                                 | 只展示文案，不在桌面计数         |
| 别名在服务端展开后再镜像                                    | Electron 不解析密钥              |

OMC 合并顺序：OMC-7 先于 OMC-8；OMC-2 先于「成员开局」里的模型条目。

---

## 8. 验证

```bash
npm run test:company
npm run test:web
npm run check:boundaries
# 改完一轮
npm run fix-check
```

手测：用 org-admin 走完开局清单；用 auditor 确认无写入口；用未授权队打一条连接 Action，应 deny。

---

## 9. 建议排期（OMC 一人）

| 周   | 做                                  | 完成定义                               |
| ---- | ----------------------------------- | -------------------------------------- |
| 1    | OMC-1 · OMC-3 ·（OMC-2 文案或跳过） | 开局清单 + 角色控件；模型一步链到 Omni |
| 2    | OMC-4 · OMC-6 · OMC-5               | 专家页 + 藏导航 + 成员说明             |
| 3–4  | OMC-7 → OMC-8 → OMC-9               | 队头 → 连接授权 → 配额                 |
| 之后 | OMC-10–12                           | 详情 / MCP 目录 / 别名                 |

合计主路径约 **3–4 周**。第三轮可与飞书客户并行，不堵试点。
