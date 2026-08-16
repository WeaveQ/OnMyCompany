# OnMyAgent 开发计划（公司对接）

| Field  | Value                                                       |
| ------ | ----------------------------------------------------------- |
| Status | **active** · 2026-08-15                                     |
| 仓     | `../onmyagent`                                              |
| 对端   | [OMC-DEV-PLAN.md](./OMC-DEV-PLAN.md)（本文件先存在 OMC 仓） |
| 契约   | [DESKTOP-CONTRACT](../onmycompany/DESKTOP-CONTRACT.md)      |
| 工作量 | 熟仓 1 人；`XS` ≤0.5d · `S` 1–2d · `M` 3–5d · `L` 6–10d     |

本文只写 **公司模式 / 管控对接**。OMA 本机办公主路径（OpenCode 会话、工作区、个人 Skill）不在范围里。

---

## 1. 一句话

桌面把公司配置镜像用完整：登录后看得见下发物，外发走 Gateway，拒绝说人话，当前队能带上。不在 Electron 里做企业库或第二套策略编辑器。

---

## 2. 边界（不可回退）

| ID     | 规则                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| D1     | 未登录完整本机。可有「连接公司」。无登录墙。无 BaseUrl 时 **零** Company HTTP，不创建 `profiles/company`。 |
| B1     | 登录后仍可切回 local，不永久锁 company。                                                                   |
| C1     | 尊重 `policy.egress`。`gateway_required` 时敏感类走 Gateway，不用本机 secret 直连。                        |
| 配置   | 只读镜像 OrgConfig。写策略、写连接密钥、企业 workspace CRUD：禁止。                                        |
| 工作区 | 始终本机。OMA Phase 2 旧文里的「企业工作区」以本仓契约为准，已作废。                                       |
| 审批   | 企业审批队列非主路径。本机 `ApprovalMode` 可留。                                                           |

契约变更先改 OMC 的 DESKTOP-CONTRACT / CONFIG-SCHEMA / API-NOTES，再改本仓。不要在桌面发明 `/api/company/{memberId}` 一类新分区。

---

## 3. 现状（以代码为准，不以 2026-08-02 Phase 2 旧表为准）

**已有**

| 模块                 | 路径                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| 设置持久化           | `apps/desktop/electron/company-settings.json` ← `company-client.mjs`                               |
| 登录 / 拉配置 / 镜像 | `company-client.mjs`：`/health` · email OTP · `/api/me` · manifest · `/api/org/config`             |
| 公司设置页           | `apps/app/src/react-app/domains/settings/pages/company-view.tsx`（Settings → Workspace → Company） |
| 货架摘要             | 设置页展示 skills / experts / models / gateway / policy 快照                                       |
| 个人 Skill 叠加      | `allowPersonalSkills(policy)`                                                                      |
| 本地策略试算         | `evaluateCompanyActionPolicy` 读镜像 `policy.json`（IPC：`companyEvaluateAction`）                 |

**没有（本计划要补）**

| 缺口                     | 证据                                                |
| ------------------------ | --------------------------------------------------- |
| 不拉生效策略             | `company-client.mjs` 无 `GET /api/policy/effective` |
| 不签发 runtime token     | 无 `POST /api/company/runtime-tokens`               |
| 不打执行面               | 无 `POST /v1/actions`                               |
| 渲染层未走 IPC 试算      | React 未调用 `companyEvaluateAction`                |
| 无队上下文               | 全仓无 `X-Team-Id`                                  |
| 全 runtime egress 未强制 | ROADMAP 仍标延期                                    |

ROADMAP 写「设置 UI 可后补」已过时：页面在。剩下的是开局摘要、执行闭环、队头、拒绝文案。

---

## 4. 三轮任务

### 第一轮 · 成员开局可见（1.5–2.5d）

跟 OMC 第一轮对齐。OMC 出模型表单和专家页后，桌面只消费。

| ID    | 任务                                                                                                                                                       | 落点                  | 量  | 验收                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --- | ----------------------------------------------------------- |
| OMA-1 | 公司设置页开局摘要：已登录 / 已同步版本 / Skills 数 / 专家数 / 模型数 / 网关服务；写明下一步「用公司模型聊、工具走网关」                                   | `company-view.tsx`    | S   | 未登录不请求公司；登录后 10 秒内看到与 OrgConfig 一致的计数 |
| OMA-2 | 模型：company 模式 chat 指 OmniRoute（`OMC_OMNIROUTE_V1` / 镜像 `models.json` 的 baseUrl）。空态写「管理员在模型路由里配」，**不要**在桌面或企业设置填 Key | 设置页 models 段      | XS  | 无 API Key 输入框；不把 OMC 当模型网关                      |
| OMA-3 | 专家货架：company 模式只读展示组织 `experts/installed`，文案「公司下发」                                                                                   | plugins / expert 货架 | S   | 管理员在 OMC 启用后，同步即出现；无「在公司里开聊」         |
| OMA-4 | 切回 local / 登出                                                                                                                                          | 已有，补验收          | XS  | 登出后零公司 HTTP；local 配置还在                           |

**联调（契约 §6 的 1–5、8–9）：** 无 BaseUrl 零流量；有 BaseUrl 未登录无墙；登录有 `memberId`；skills/experts 与组织一致；Company 宕机 Mode A 仍可用。

### 第二轮 · 执行闭环 + 队（2–3d）

必须先有 OMC-7（服务端认 `X-Team-Id`）。连接授权（OMC-8）和配额（OMC-9）落地后，桌面只展示 deny。

| ID    | 任务                                                                                | 落点                                  | 量  | 验收                                                                    |
| ----- | ----------------------------------------------------------------------------------- | ------------------------------------- | --- | ----------------------------------------------------------------------- |
| OMA-5 | 登录后 `GET /api/policy/effective`，刷新镜像后重拉                                  | `company-client.mjs`                  | S   | 与镜像 `policy.json` 冲突时以 effective 为准做展示                      |
| OMA-6 | `POST /api/company/runtime-tokens`，token 只留主进程；工具外发走 `POST /v1/actions` | `company-client.mjs` · Gateway client | S–M | 桌面日志 / 响应无 provider secret；company 模式敏感 Action 不走本机 Key |
| OMA-7 | 当前队：从 `/api/me.teams[]` 选择，请求带 `X-Team-Id`                               | 设置页或壳切换器 · client             | S   | 换队后下一次 `/v1` 或 `/mcp` 带头；不选则不带头（进 OMC 未归属）        |
| OMA-8 | deny UX：配额 / 连接未授权 / Action 拒绝，展示服务端 `message` + `source`           | 会话或设置通知                        | S   | 不吞错误；不在桌面自己算配额                                            |
| OMA-9 | 渲染层调用 `companyEvaluateAction`（预检），最终仍以 Gateway 裁决为准               | session / 工具路径                    | S   | 预检 deny 可拦；放行后仍可能被 OMC 拒                                   |

Personal 辅轨持同一 runtime token：契约 §5 第 8 步，本轮可选，不堵主路径。

### 第三轮 · 跟 OMC 资源面（0.5–2d）

| ID     | 任务                                          | 落点               | 量  | 验收                         |
| ------ | --------------------------------------------- | ------------------ | --- | ---------------------------- |
| OMA-10 | `tools/mcp.json` / gateway 投影只读展示       | 设置或货架         | XS  | 不在桌面解析 `@config:` 密钥 |
| OMA-11 | 组织 Skill 详情只读（若 OMC-10 提供正文 API） | marketplace / 设置 | S   | company 模式不可改组织包     |

命名配置引用（OMC-12）在 **服务端展开**。OMA **0 工作量**，禁止在 Electron 里做别名→secret。

---

## 5. 后置

| ID     | 项                                                 | 量  | 备注                                 |
| ------ | -------------------------------------------------- | --- | ------------------------------------ |
| OMA-12 | 全 runtime `gateway_required` 强制（所有外发收口） | L   | ROADMAP 延期。OMA-6 只覆盖主工具路径 |
| OMA-13 | 飞书登录公司                                       | M   | 等 OMC-15                            |
| OMA-14 | 飞书等连接器走公司 Gateway（不是 IM 机器人）       | M   | 等 OMC-13；货架走 `CAPABILITY_SHELF` |
| OMA-15 | SSO 按钮                                           | L   | 等 OMC-14                            |
| OMA-16 | Personal 辅轨持公司 token                          | S   | 契约已写，非开局                     |

---

## 6. 明确不做

| 项                                 | 原因                                   |
| ---------------------------------- | -------------------------------------- |
| Electron 内编辑 OrgConfig / policy | 第二真相，禁止                         |
| 写连接 secret                      | ops-admin / 管理台                     |
| 企业审批队列 UI                    | 非主路径                               |
| 远程工作区                         | 工作区本机                             |
| 管理台式「数字员工对话」           | 对话仍是本机会话                       |
| 把 chat 改打到 OMC `/v1`           | 模型在 Omni；OMC `/v1` 只跑工具 Action |
| 解析公司密钥 / `@config:`          | 服务端展开                             |

OMA Phase 2 文档若仍写「2c 工作区隔离由 Company 做」「默认企业工作区」，以本仓 [Architecture §1.1](../Architecture.md) 和 DESKTOP-CONTRACT 为准，不要按旧切片实现。

---

## 7. 与 OMC 的依赖

```text
OMA-1..4  可与 OMC-1..5 并行（镜像协议已稳定）
OMA-5..6  不堵 OMC；OMC 端点已存在
OMA-7     需要 OMC-7 已认 X-Team-Id
OMA-8     完整文案需要 OMC-8 / OMC-9
OMA-3     专家列表需要 OMC-4 先能写 experts/
OMA-12    独立，可最后做
```

不要等 OMC 三轮全部做完再开工。第一轮可以立刻做。

---

## 8. 验证

在 `../onmyagent`：

```bash
# 公司客户端
# company-client.test.mjs（login → config → 零流量 D1）
```

手测（契约 §6 九条）：

1. 清掉 BaseUrl：抓包无公司请求。
2. 只填 BaseUrl 不登录：看得到连接 UI，无墙，无 `profiles/company`。
3. 登录：`/me` 有 `memberId`，镜像 version 与管理台一致。
4. 管理员启用一个 Skill / 专家：同步后桌面列表出现。
5. 切回 local：本机 Skill 还在。
6. company 模式跑一条敏感 Action：走 `/v1`，桌面无 secret。
7. 未授权连接或超配额：看见服务端文案。
8. 登出：回 Mode A，无残留公司请求。
9. 停掉 OMC：本机会话仍可用。

---

## 9. 建议排期（OMA 一人，可与 OMC 并行）

| 周                 | 做                    | 完成定义                                     |
| ------------------ | --------------------- | -------------------------------------------- |
| 与 OMC 第 1 周并行 | OMA-1 · OMA-2 · OMA-4 | 设置页开局摘要，无 Key                       |
| 与 OMC 第 2 周并行 | OMA-3 · OMA-5 · OMA-6 | 专家只读 + effective + runtime token + `/v1` |
| 等 OMC-7           | OMA-7 · OMA-8 · OMA-9 | 当前队 + deny 文案 + 预检                    |
| 之后               | OMA-10 · OMA-11       | 跟 OMC 第三轮                                |

合计公司对接约 **不到 1.5 周**（不含 OMA-12 全 egress）。工作量小于 OMC，是因为 2b 客户端和设置页已经在。
