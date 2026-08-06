# 多小团队隔离 + 企业 / 团队 IA（定稿）

> **总计划**：[ORG-TEAM-PLAN.md](./ORG-TEAM-PLAN.md)  
> **角色白话与矩阵**：[RBAC.md](./RBAC.md)  
> **分支**：`feat/team-isolation-members`  
> **桌面联动**：`onmyagent/.loop/goals/omc-team-isolation`

## 1. 模型（与代码一致）

```text
企业 Org（单 org / default）
├── 企业账号 /members       ← 账号 SoT：企业角色、启停、删除
├── 团队（侧栏只一项「团队」）
│     ├── /team             ← 当前小团队 membership + 队内角色
│     └── /org/teams        ← 全部团队（不进侧栏；全公司上下文或页内入口）
├── 企业设置 /org-config    ← 策略 / 模型 / Skills 启用
├── 切换器：全公司 | Team A | Team B …
└── 连接默认企业共享（ACL 二期）
```

| 视角                              | 谁用                  | 行为                                                             |
| --------------------------------- | --------------------- | ---------------------------------------------------------------- |
| **全公司** `ALL_TEAMS_ID=__all__` | 企业管理员 / 企业审计 | 用量/运行不按 team 过滤；侧栏「团队」→ `/org/teams`              |
| **具体团队**                      | 全员                  | 切换上下文；usage/runs 带 `teamId`；侧栏「团队」→ `/team?team=…` |

**守卫**：`resolveMembershipTeamId` / `teamNavTarget` — 禁止 `GET /api/teams/__all__/members`。

## 2. 角色（摘要）

| UI 名      | 层   | 代码          | 一句话                      |
| ---------- | ---- | ------------- | --------------------------- |
| 企业管理员 | 企业 | `admin`       | 管人、建队、改企业设置      |
| 企业审计   | 企业 | `auditor`     | 只看全公司日志/用量，不能改 |
| 员工       | 企业 | `member`      | 普通账号，先入花名册再入队  |
| 团队所有者 | 团队 | `creator`     | 建队人，锁死                |
| 团队管理员 | 团队 | team `admin`  | 本队加人/改角色             |
| 团队成员   | 团队 | team `member` | 本队协作                    |

详情与矩阵见 [RBAC.md](./RBAC.md)。

## 3. 已落地

- [x] 侧栏：**企业账号** · **团队**（合并列表，不单独「团队列表」）· **企业设置**
- [x] `/members` 唯一企业生命周期入口；`/team` 仅 membership
- [x] `/org/teams` 建队、点进本队；页内「全部团队」
- [x] 入队优先企业账号池
- [x] 角色中文徽章（企业 / 团队分层）
- [x] 全公司哨兵 + membership 不吃 `__all__`
- [x] HTTP run 写 `teamId`；`runs?teamId=`；审计分页
- [x] last org-admin 不可停用/删除

## 4. 后续（未做）

- [ ] 连接按团队授权（`connection_team_grants`）
- [ ] MCP / runtime-token 默认 `teamId`
- [ ] 队级 policy 叠加
- [ ] 历史 run「未归属」桶
- [ ] 显式 `owner` 角色字段（当前 last-admin 规则已够用）

## 5. 桌面调用

```http
Authorization: Bearer <runtime-token>
X-Team-Id: <active-team-id>
```

未传 `X-Team-Id` 时 run 无 team 归因；全公司可见，单队过滤会漏。

## 6. 相关文件

- `web/src/ui.tsx` · `members-page.tsx` · `org-teams-page.tsx` · `team-manage-page.tsx` · `team-ui.ts` · `member-session.ts`
- `src/company/routes.ts` · `src/company/auth/store.ts` · `src/server/connect-server.ts`
- `docs/onmycompany/RBAC.md` · `API-NOTES.md` · `ORG-TEAM-PLAN.md` · `BOOTSTRAP.md`
