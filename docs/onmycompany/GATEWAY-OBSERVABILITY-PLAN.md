# 自建网关层 · 可用性 · 观测与计量 — 实施计划

> **状态**：已审核修订（2026-08-04）· **G0 / G1a / G2 主路径已落地**；G1b / G3 仍可选未做  
> **原则**：路径 A 单进程 + SQLite；**不**引入 OpenMeter/Lago；先护栏与外发可用性，再瘦计量。  
> **知识库镜像**：`OnMyCompany/04_技术架构/0804 自建网关层与观测计划.md`

| 关联     | 文档                                                        |
| -------- | ----------------------------------------------------------- |
| 架构     | [Architecture.md](../Architecture.md)                       |
| 痛点口径 | 知识库《终究解决什么痛点》· 本仓 [ROADMAP.md](./ROADMAP.md) |
| 配置     | [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md)                      |
| 桌面     | [DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md)                |
| API      | [API-NOTES.md](./API-NOTES.md)                              |
| RBAC     | [RBAC.md](./RBAC.md)                                        |

### 落地状态（相对本计划 · 2026-08-04）

| 阶段    | 状态      | 代码 / API                                                                          |
| ------- | --------- | ----------------------------------------------------------------------------------- |
| **G0**  | ✅ 主路径 | `concurrency-guard.ts` · `OMC_MAX_IN_FLIGHT` / `OMC_MAX_IN_FLIGHT_PER_MEMBER` · 429 |
| **G1a** | ✅ 主路径 | `connection-fallback.ts` · action-runner · run.`fallback`/`attempt`                 |
| **G1b** | ⚪ 未做   | 默认模型直连；勿写为已交付                                                          |
| **G2**  | ✅ 主路径 | `/api/company/usage` · `pricing` · `runs` · 管理台 `/metering`                      |
| **G3**  | ⚪ 未做   | 软配额                                                                              |

---

## 0. 一句话目标

在 **不改变「主菜 = 连接 / 策略 / 外发」** 的前提下，让经 Gateway 的流量：

1. **扛得住** — 超时、并发帽、有界流式（防长连拖死）
2. **连得稳** — 组织共享 Connections 上的主备 / fallback（先工具与出网，可选模型）
3. **看得见** — runs 归因、用量 KPI、日志、价目只读

**明确不做**：实时预扣费、商业 invoice、网络层劫持个人 ChatGPT、默认全量 LLM 反代中台。

---

## 1. 与产品钉死点对齐（审核结论 · 必须先读）

### 1.1 流量边界（与《终究痛点》一致）

```text
Agent 客户端
  ├─ 模型推理 chat ──默认──► 厂商直连（models.json = 目录声明，非强制反代）
  └─ MCP · /v1 Action ─────► OnMyCompany Gateway ──► 飞书 / GitHub / …
```

| 类型                         | 是否默认进 Gateway     | 本计划                                           |
| ---------------------------- | ---------------------- | ------------------------------------------------ |
| **工具 / 外发 Action · MCP** | **是**（主路径）       | G0 / **G1a** / G2 主对象                         |
| **模型推理（chat）**         | **否**（默认直连厂商） | **G1b 可选**；组织显式开启才做逻辑模型 + Plan 池 |
| 个人网页模型 / 裸 Key        | 否                     | 永远不可见、不计费                               |

**计量口径（钉死）**：

> 只统计 **经本公司 Gateway 的调用**（主要是 Action/MCP runs）。  
> **不是**「公司每一个人每一次聊模型」。

### 1.2 员工「连我的系统」指什么

| 说法                 | 准确含义                                                             |
| -------------------- | -------------------------------------------------------------------- |
| 员工直连 OnMyCompany | 连 **公司 Gateway** 做 **外发与组织能力**（配置、token、Action/MCP） |
| 不等于               | 默认所有 LLM token 都灌进这一台机器                                  |

密钥仍只在 Gateway Connections；员工持 member session / runtime token。  
`egress.mode`：`local_ok` → `gateway_preferred` → 试点敏感类 `gateway_required`（全链路强制见 ROADMAP 延期，与桌面契约协同）。

### 1.3 复杂度预算

| 范围                           | 相对当前试点   | 部署                   |
| ------------------------------ | -------------- | ---------------------- |
| **G0** 护栏                    | +5%～10%       | 无新服务               |
| **G1a** Connection/Action 主备 | +10%～20%      | 无新服务               |
| **G1b** LLM 逻辑路由（可选）   | +15%～25% 另计 | 无新服务；**默认不做** |
| **G2** 瘦计量 UI + API         | +10%～20%      | 无新服务               |
| **G3** 软配额                  | +15%           | 无新服务               |
| OpenMeter / Lago / 预扣账单    | +80%～150%+    | **否决（默认）**       |

**推荐顺序：G0 → G1a → G2 →（可选）G3；G1b 仅产品升格后启动。**

---

## 2. 阶段计划

### G0 — 连接与可用性护栏（优先）

**目标**：服务不被无限长连 / 请求堆积拖死；客户端可重连。

| 项       | 要求                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 连接形态 | **短 HTTP 为主**；流式 = **单次调用内** SSE/chunked，结束即断                                   |
| 禁止默认 | 无上限、无心跳的全局永久 WebSocket 总线                                                         |
| 超时     | 读/写空闲 60～120s；单次流式硬顶 3～10 min（`OMC_*` 可配）                                      |
| 并发帽   | 全局 in-flight + 每 member（可选每 IP）；超限 **429** 且可观测                                  |
| 上游     | 上游 timeout **&lt;** 客户端/网关对外 timeout                                                   |
| MCP      | idle 超时 + **每用户会话数上限**                                                                |
| 反代     | 生产 Nginx/Caddy 终止 TLS、限制连接                                                             |
| 多实例   | 允许 **多只读 / 多反代 upstream**；**SQLite 写路径仍建议单 writer**（勿多实例同时写同一库文件） |

**验收**：超 cap → 明确 429；空闲被踢；流式超时后客户端可重试。

**落点**：`src/server` 入口 / ConnectServer、ENV、反代样例、[ENV.md](./ENV.md)。

**与桌面**：断流 = 保护；OMA 需可重连 — 条目补 [DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md)。

---

### G1a — 工具 / Connection 主备与 fallback（默认主菜）

**目标**：组织共享连接上，**同一能力多账号/多 Key** 时主挂备顶；不改变「LLM 默认直连」。

适用例：

- 同一 `service` 多个 `connectionName`（主 bot / 备 bot）
- Action 执行遇上游 429/5xx/timeout → 按策略换 connection 再试
- 每次 attempt 写入 run（见 §3 字段）

```text
Action 请求（已鉴权 runtime token）
  → 解析 service + 允许的 connection 候选（有序）
  → try #1 primary → 失败且可 fallback → try #2
  → 写 run：connectionName, attempt, fallback, errorCode
```

| 自动 fallback                          | 不自动 fallback                 |
| -------------------------------------- | ------------------------------- |
| 429 限流/额度                          | 业务 4xx（参数/校验）           |
| 5xx / 连接失败 / 超时                  | 策略 deny（policy）             |
| 401/403 且判定为该 connection 凭证问题 | 用户显式指定唯一 connectionName |

**约束**：`maxAttempts ≤ 3`，`totalBudgetMs` 封顶；connection 级 **cooldown**（如 60s）。  
**禁止**：热路径预扣余额、主动轮询各厂商额度 API。

**验收**：主 connection 模拟 429 → 第二次走备；run 可见 `fallback=true`。

**落点**：action-runner / connection 选择；策略与 OrgConfig 中「允许的 connection 列表」；不必先做 LLM 反代。

---

### G1b — 逻辑模型 + Token Plan 池（可选 · 默认关闭）

**仅当**组织明确要求「模型也走 Gateway」时启用（产品升格 = 修订痛点文档中的默认流量图）。

```text
Logical Model（如 company-default-chat）
  candidates[]:
    { connection, model, priority }
  policy: on [429,401,5xx,timeout], maxAttempts, totalBudgetMs, cooldown
```

| 依赖                 | 说明                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| 统一「模型调用出口」 | 若调用散落多处，先收口再挂路由（工期易超 2～4d 乐观估计）                       |
| 桌面/Agent           | chat 走 companyBaseUrl，而非厂商直连                                            |
| 配置                 | `modelRoutes` 写入 [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md)；Key 仍在 Connections |

**未升格前**：管理台与文档不得把 G1b 写成默认能力；价目表（G2）可仍展示「参考价」，不代表流量过网关。

---

### G2 — 观测与瘦计量（自建）

**目标**：管理台「用量 / 日志 / 价格」心智对齐 OOMOL，实现 **零新中间件**。

| Tab      | 实现                                                                | 数据主来源           |
| -------- | ------------------------------------------------------------------- | -------------------- |
| **用量** | 扩 `GET /api/company/usage`：`from`/`to`/`teamId?`/`memberId?`、KPI | runs 聚合            |
| **日志** | `/api/runs` 分页 + 筛选；可标 fallback/失败                         | runs                 |
| **价格** | 静态/半静态 `pricing` catalog 只读（LLM + 工具参考价）              | 配置文件，非实时计费 |
| **花费** | 可选：有 token 字段时查询时 `×` 价目估算                            | 非热路径             |
| **个人** | 当前 member 过滤                                                    | RBAC：member 仅自己  |

**KPI 建议（无 token 时也成立）**：

- 事件/run 数、成功/失败、活跃 service、活跃 member
- 有 token 再显示「百万 tokens」类指标；**缺失则显示 — 或隐藏**，不装数据

**RunLog 渐进字段**（向后兼容）：

| 字段                                  | 用途     | 优先级                     |
| ------------------------------------- | -------- | -------------------------- |
| `connectionName?`                     | G1a      | 高                         |
| `attempt?` / `fallback?`              | G1a/b    | 高                         |
| `teamId?`                             | 团队过滤 | 中（可后关联 active team） |
| `logicalModel?` / `model?`            | G1b      | 仅 G1b                     |
| `promptTokens?` / `completionTokens?` | 花费估算 | 低～中（仅 LLM 路径能填）  |

**查询护栏**：默认时间窗（如 30 天）+ **limit（5k～20k）**；禁止无窗扫全历史；量大再 **按日 rollup**（仍可不引入 ClickHouse）。

**已有资产**：`/api/company/usage`、`summarizeUsage`、`/api/runs`、`audit/export`、`memberId`（M3）。

**RBAC（建议）**：

| 角色                | 计量/日志                            |
| ------------------- | ------------------------------------ |
| org-admin / auditor | 组织范围                             |
| member              | 默认仅本人 runs；无跨成员明细        |
| ops-admin           | 运维面；产品计量页以 member 体系为准 |

**验收**：空数据可展示；有 run 时 KPI 与列表一致；价目可配置更新且不依赖 G1b。

**明确不做**：OpenMeter、Lago、Kill Bill；**Prometheus 不当业务计量真相**（仅可作运维旁路）。

---

### G3 — 软配额（可选）

| 项   | 说明                                                      |
| ---- | --------------------------------------------------------- |
| 维度 | team 和/或 member · 日/月 **run 次数** 或 token（有则用） |
| 来源 | G2 同一聚合，允许分钟级滞后                               |
| 超限 | 拒绝 或（若 G1a/b 有 cheaper 候选）降级                   |
| 不做 | 分布式预扣、跨实例强一致余额                              |

---

## 3. 观测分层

| 层           | 用途                                       | 实现                              |
| ------------ | ------------------------------------------ | --------------------------------- |
| **业务计量** | 谁、哪个 service/connection、是否 fallback | RunLog + usage（G2）              |
| **审计**     | 登录、配置写                               | company audit events（已有方向）  |
| **运维**     | 存活、延迟、429、连接拒绝                  | `/health`；日志；以后可选进程指标 |
| **追踪**     | 跨连接器 trace                             | OTEL **后置**，不挡 G0–G2         |

**试点最低清单**：health、run 成功/失败率、fallback 次数、网关 429、超时/并发拒绝日志。

---

## 4. 长连接策略（摘要）

```text
配置 / 鉴权 / 列表     → 短 HTTP
单次 Action / 有界流式 → 超时 + 硬顶
MCP                    → idle + 每用户会话上限
桌面常驻               → 本机进程可常驻；对 Gateway 短会话或用完再连
```

**长连接 = 有超时的一次调用，不是永远在线管道。**

---

## 5. 员工接入（产品路径）

1. 部署 OnMyCompany（Docker + SQLite，**单 writer**）
2. 运维配 Connections（及 G1a 主备）
3. 员工 OnMyAgent：`companyBaseUrl` + 登录
4. runtime token / company 配置下发
5. **Action/MCP** → Gateway → 上游；run 落库 → 管理台
6. **Chat 推理**：默认仍可直连厂商；仅开启 G1b 后走 Gateway

---

## 6. 里程碑与依赖

| 阶段 | 依赖                          | 产出                       |
| ---- | ----------------------------- | -------------------------- |
| G0   | 现网 server                   | 超时/并发 ENV + 行为说明   |
| G1a  | G0；多 connection             | runner 候选 + run 字段     |
| G2   | 可与 G1a 部分并行；价目可先做 | usage 扩展 + 计量页        |
| G1b  | **产品升格** + 模型出口收拢   | modelRoutes + 客户端改路径 |
| G3   | G2 稳定                       | 软配额开关                 |

**工期量级（1 人熟仓，非承诺）**：G0 0.5～1d · G1a 2～4d · G2 3～5d · G1b 另计 1～2 周量级（含收口与桌面）· G3 1～2d。

---

## 7. 风险与非目标

| 风险                   | 缓解                           |
| ---------------------- | ------------------------------ |
| 做成默认全量 LLM 反代  | §1 钉死；G1b 默认关            |
| 计量=全公司 LLM        | 口径 + UI 文案写「经 Gateway」 |
| 长连拖死               | G0；反代；SQLite 单写          |
| 查询扫爆               | 时间窗 + limit；日 rollup      |
| fallback 逻辑复制 N 处 | **单一执行出口** 再挂候选      |
| 过早上 Lago/预扣       | 否决至有对外计费需求           |

**非目标**：商业 invoice、多产品线计量中台、透明代理、默认 LLM 反代。

---

## 8. 决策记录

| 日期       | 决策                                                      |
| ---------- | --------------------------------------------------------- |
| 2026-08-04 | 员工连 Gateway 做外发与组织能力；密钥集中                 |
| 2026-08-04 | 自建瘦计量；默认不上 OpenMeter/Lago                       |
| 2026-08-04 | Plan/主备：先 **G1a 工具与 Connection**；**G1b LLM 可选** |
| 2026-08-04 | 与《终究痛点》对齐：模型推理默认不进 Gateway              |
| 2026-08-04 | 先 G0/G1a 可用性，再 G2 报表                              |
| 2026-08-04 | 审核：修订 G1 拆分与流量边界后可作为正式下一阶段          |

---

## 9. 开工检查表

- [ ] **G0**：盘点现有超时/并发；补 `OMC_*` 与 ENV.md
- [ ] **G0**：DESKTOP-CONTRACT 补「可重连 / 断流非事故」
- [ ] **G1a**：Connection 候选解析 + runner attempt 循环
- [ ] **G1a**：RunLog `connectionName` / `attempt` / `fallback`
- [ ] **G2**：usage 时间窗与 limit；管理台路由与 RBAC
- [ ] **G2**：pricing 示例 JSON（参考价，标明非实时账单）
- [ ] **G1b**（可选）：产品书面升格后再改 CONFIG-SCHEMA `modelRoutes`
- [ ] 同步 [API-NOTES.md](./API-NOTES.md) / [ROADMAP.md](./ROADMAP.md) 完成态

**开工口令**：「按 GATEWAY-OBSERVABILITY-PLAN 做 G0」·「做 G1a」·「做 G2 计量页」。
