# Config schema — local / company 同构

| Field | Value |
| --- | --- |
| Status | **Active** — 契约 SoT（服务端实现 M2；桌面 2a 已落地） |
| Desktop SoT | `onmyagent/docs/design/2026-08-02-config-consistency.md` |
| Phase map | `onmyagent/docs/design/2026-08-02-phase-2-enterprise-prep.md` |
| Server layout | `docs/Architecture.md` §3 |

## 1. One-liner

**`local` 与 `company` 共用一套 config schema。** 切换 profile 只换指针与写权限，不换产品逻辑。

| 层 | 一致 | 刻意不同 |
|----|------|----------|
| Schema | manifest / models / policy / memory/settings / skills / experts / tools/* | — |
| 消费路径 | 桌面单一 `activeConfig` | — |
| 真相源 | local = 本机磁盘；company = OrgConfig 镜像 | 写：local 可写；company 主路径只读 |
| Secrets | **永不**进 config 导出 | 本机 key / 企业 Connections 分治 |
| 用户正文 | **不在** config | awareness / 对话 / workspace |
| 未登录 | 仅 local；**禁止**建 company 树 | — |

## 2. 树形结构（两端字节级同构目标）

```text
config/
  manifest.json          # version, updatedAt, schemaVersion, (local: migration.status)
  models.json            # 模型声明；无 API key
  policy.json            # allow/deny/egress/allowPersonalBYOK…
  memory/
    settings.json        # 仅开关；不是 MEMORY 正文
  skills/                # Skill 包目录
  experts/
    installed/
    mine/
  tools/
    mcp.json
    gateway.json         # 连接/Action 目录投影；无 secret
```

### 2.1 桌面路径

```text
~/.onmyagent/profiles/{local|company}/config/
```

- `local`：2a 迁移后主路径；legacy `~/.onmyagent/skills` 与 `marketplaces/` **只复制不删**。  
- `company`：**登录后**才创建；内容来自 `GET /api/org/config`。

### 2.2 企业路径（本仓）

```text
$OMC_DATA_DIR/org/default/config/
```

MVP：默认 **一个 Org**（`default`）。多 Org 不做。

## 3. Section 语义

| Section | 组织可下发 | company 模式用户 | 备注 |
|---------|------------|------------------|------|
| skills / experts | ✅ org-admin | 只读（个人叠加以后） | 包 = 能力；记忆 C 不在此 |
| models | ✅ | 只选不改目录 | 无 key |
| policy | ✅ | **不可放宽** | 服务端单写；桌面可本地更严（可选） |
| memory/settings | 可选默认 | 可本机覆盖开关 | 正文在 UserData/awareness |
| tools/gateway | ✅ 目录投影 | 不可见 secret | 由 Connections 摘要生成 |
| tools/mcp | 可选 | 视策略 | |

## 4. manifest 约定

**企业响应 envelope（拉配置）：**

```json
{
  "version": "cfg-12",
  "updatedAt": "2026-08-03T00:00:00Z",
  "orgId": "default",
  "config": { }
}
```

桌面：`If-None-Match: cfg-12` → 304 则不换本地镜像。

**本地 manifest（OMA）** 另含 `migration.status`（`pending|complete|…`），仅 local profile 有意义；company 镜像不必抄迁移字段。

## 5. policy.json（产品策略真相）

企业写入：

```text
PUT /api/org/config/policy
  → 校验 schema
  → 落盘 policy.json +  bump manifest version
  → 事务内合成 Connect runtime-policy
  → 写 audit 事件
```

建议字段（与桌面 effective 对齐，可演进）：

```json
{
  "egress": {
    "mode": "gateway_required | gateway_preferred | local_ok",
    "sensitiveKinds": ["email.send", "…"]
  },
  "actions": {
    "allow": ["hackernews.*", "github.get_current_user"],
    "deny": ["*"]
  },
  "allowPersonalBYOK": true
}
```

- **C1**：桌面必须尊重 `egress.mode`；`gateway_required` 时敏感类不得用本机 secret 直连。  
- Decision 透出 `source: org | token | deployment`。

## 6. tools/gateway.json（无 secret）

由企业 Connections **摘要**投影，例如：

```json
{
  "services": [
    {
      "service": "github",
      "connectionName": "default",
      "configured": true,
      "accountLabel": "org-bot"
    }
  ]
}
```

- `connectionName` = 环境/账号别名，**不是** member 私有 vault（MVP 组织共享）。  
- 桌面只读此投影；**不**拿到 token/password。

## 7. 与记忆 / 专家边界（固定）

| 内容 | 落点 | 通道 |
|------|------|------|
| 专家定义 A（人设包） | `config/experts/**` | ① OrgConfig |
| 记忆开关 | `config/memory/settings.json` | ① 或本机覆盖 |
| 用户 MEMORY / 专家槽 C | `data/user/awareness/**`（桌面） | ② UserData（默认同机） |
| handbook / 工程文件 | workspace | 本机 only |
| 对话 / session-archive | OMA server SQLite 等 | 本机 only |

权威：`onmyagent/docs/design/2026-08-02-work-memory-plan.md`。

## 8. MVP 发布形态（Skill / 专家）

| 方式 | MVP | 后置 |
|------|-----|------|
| 服务器目录挂载 + `POST /api/org/config/scan` | ✅ | |
| 管理台 zip 上传 | | M7 |

目录布局与桌面 `skills/`、`experts/installed|mine` 对齐，避免双端解析分叉。

## 9. 硬规则（两端）

1. 未登录不得创建 `profiles/company`，不得打 Company HTTP。  
2. company 配置 **不得**含 secret。  
3. 迁移/同步失败 → 桌面保持 local 可用（D1）。  
4. 策略桌面不得放宽组织 deny。  
5. schema 变更：先改本文 + OMA config-consistency + API 草案 version，再写代码。

## 10. 实现检查清单

### 本仓（M0–M2）

- [ ] `data/org/default/config/` 空树 + 合法 manifest  
- [ ] `GET/PUT /api/org/config` + manifest etag  
- [ ] policy 写入触发 runtime-policy 合成  
- [ ] scan 刷新 skills/experts 列表  
- [ ] export 无 secrets  

### 桌面（2b+ · onmyagent）

- [x] local profile + migrate（2a）  
- [ ] `companyBaseUrl` + session  
- [ ] 登录后写 `profiles/company/config`  
- [ ] `activeProfile` 切换  
- [ ] 未登录不建 company 树  

## 11. Changelog

| Date | Note |
| --- | --- |
| 2026-08-03 | 初版：对齐 OMA config-consistency；企业磁盘路径；policy/gateway 约定 |
