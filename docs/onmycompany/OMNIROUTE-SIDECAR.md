# OmniRoute 边车（B）+ 配置导航一体（D）

与 OnMyCompany **进程分离**：模型热路径不进 OMC，产品上可同一套交付与导航。

| 平面              | 进程        | 端口                            | 流量                               |
| ----------------- | ----------- | ------------------------------- | ---------------------------------- |
| **工具 / 管控**   | OnMyCompany | API **3100** · Console **5180** | `/v1/actions` · `/mcp` · 企业 API  |
| **模型路由**      | OmniRoute   | **20128**                       | OpenAI 兼容 `/v1` chat · dashboard |
| OnMyAgent（参考） | 桌面        | 5173 / 8787                     | 勿与上表冲突                       |

架构图：`diagrams/omc-omniroute-adapt.png`。

---

## B · 启动边车

### 开发（推荐轻量）

```bash
# 终端 1 — OMC
cd /path/to/onmycompany && npm run dev

# 终端 2 — OmniRoute
npm run dev:omniroute
```

### Docker

```bash
docker compose -f docker-compose.omniroute.yml up -d
```

Dashboard: http://127.0.0.1:20128/dashboard  
Models: `curl -s http://127.0.0.1:20128/v1/models | head`

---

## D · 配置一体（不反代 chat）

### 环境变量（OMC）

| 变量                          | 默认                     | 用途                          |
| ----------------------------- | ------------------------ | ----------------------------- |
| `OMC_OMNIROUTE_URL`           | `http://127.0.0.1:20128` | 边车根 URL（健康探测）        |
| `OMC_OMNIROUTE_DASHBOARD_URL` | `{URL}/dashboard`        | 管理台外链                    |
| `OMC_OMNIROUTE_V1`            | `{URL}/v1`               | `models.json` / Agent baseUrl |

见 `.env.example`。

### OrgConfig `models.json`

新建 OrgConfig 骨架时会写入「企业默认 → OmniRoute」目录项（**无 secret**）。  
已有空文件可手工合并 `examples/omniroute-models.json`，或管理台「企业设置」编辑 models。

Agent / 桌面 chat：

```bash
export OPENAI_BASE_URL=http://127.0.0.1:20128/v1
export OPENAI_API_KEY=<OmniRoute dashboard key>
```

工具仍：

```bash
# OMC runtime token
export OMC_GATEWAY=http://127.0.0.1:3100
# MCP: http://127.0.0.1:3100/mcp
```

### 管理台

侧栏 **模型路由** → 打开 OmniRoute dashboard（外链）。  
`GET /api/company/health` 含 `modelRouter: { enabled, baseUrl, dashboardUrl, ok }`。

---

## 硬边界（勿破坏）

1. **Chat 默认不经 OMC 进程**（非 G1b）。
2. **模型 Key 只在 OmniRoute**；SaaS 连接 Key 只在 OMC。
3. OrgConfig **永不写 secret**。
4. 审计：LLM 用量 → OmniRoute；业务外发 → OMC runs / 审计事件。

---

## 价格打通（方案 B）

| 区块         | 数据来源                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **LLM 价目** | 默认从 OmniRoute `GET {OMC_OMNIROUTE_URL}/api/pricing` 拉取；失败回落本地 `data/company/pricing.json` / 内置表 |
| **工具价目** | **始终本地**（连接器参考价）                                                                                   |
| **LLM 用量** | `GET /api/company/usage/llm` ← OmniRoute `GET /api/usage/history`                                              |
| **工具用量** | `GET /api/company/usage` ← OMC runs（成员归因）                                                                |

```bash
# 成员会话
curl -s "http://127.0.0.1:3100/api/company/pricing?source=auto" \
  -H "Authorization: Bearer <omc_member_token>"
# source=static | omniroute | auto
```

环境变量：`OMC_OMNIROUTE_ADMIN_KEY`（若 Omni 要鉴权）、`OMC_OMNIROUTE_PRICING_PATH`、`OMC_PRICING_SOURCE`。  
管理台 **计量 → 价格** 会显示来源行（LLM ← OmniRoute · 工具 ← 本地）。

> 仍是**参考价**，不是 Omni 实时扣费账单；工具外发计量仍只统计经 OMC Gateway 的 runs。

## 观测两本账（别混）

| 查什么                             | 打开哪里                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| 模型 / token / 限流 / fallback     | OmniRoute dashboard（概览「模型观测」或侧栏「模型路由」） |
| 谁调了外发工具、策略拒绝、登录配置 | OMC 计量 / 运行 / 审计事件                                |

管理台 **概览** 顶部有「观测入口（两本账）」卡片，方便跳转。

## 非目标

- 同进程 `import` OmniRoute
- OMC 反代全部 chat（G1b）
- 把 OmniRoute 当飞书/Gmail 连接器替代品
- 用 Omni 的模型账单替代 OMC 业务审计
