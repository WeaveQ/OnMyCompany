# Bootstrap 与双 Admin

## 双身份（平台 vs 企业）

| 身份           | UI / 口语    | 代码        | 凭证                         | 能力                                          |
| -------------- | ------------ | ----------- | ---------------------------- | --------------------------------------------- |
| **平台运维**   | 控制台解锁   | `ops-admin` | `OMC_ADMIN_TOKEN`            | 连接 secret、OAuth client、底层调试           |
| **企业管理员** | 企业账号角色 | `admin`     | 成员 OTP session             | 企业设置、花名册、建队、策略、审计、Skills 写 |
| **企业审计**   | 只看不改     | `auditor`   | 成员 session                 | 审计导出 / 用量 / 运行只读、全公司视图        |
| **员工**       | 普通账号     | `member`    | 成员 session + runtime token | 拉配置、执行 `/v1`、自己的 runs               |

完整矩阵与白话说明：[RBAC.md](./RBAC.md)。  
同一人可兼持 **ops-admin token + 成员 session**；鉴权必须分流。

## 首个企业管理员（已实现）

```text
1. 设置 OMC_BOOTSTRAP_ADMIN_EMAIL=you@company.internal
2. 可选 OMC_DEV_OTP=000000（默认 000000）
3. members 为空时：该邮箱 email/verify 成功 → roles 含 admin
4. 之后禁止自助注册；仅企业管理员（或团队 admin 入队场景）加人
5. 登录成功会 ensureDefaultTeam（团队切换器用）
6. ops-admin token 独立配置，不自动等于企业管理员
7. 不可停用/删除最后一个 admin（store 层拒绝）
```

### 登录方式

| 档          | 方式                                           | 状态                        |
| ----------- | ---------------------------------------------- | --------------------------- |
| 本地 / 内网 | Dev OTP（响应 `devCode` 或固定 `OMC_DEV_OTP`） | ✅                          |
| 可选        | `OMC_SMTP_URL` 真发 OTP                        | ✅ 可选                     |
| 后置        | 真飞书 OIDC 换票                               | `feishu/verify` 501，不发卡 |

## 本地运维

```bash
export OMC_ADMIN_TOKEN="$(openssl rand -hex 24)"
export OMC_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export OMC_DATA_DIR="$PWD/data"
export OMC_BOOTSTRAP_ADMIN_EMAIL="admin@company.internal"
export OMC_DEV_OTP="000000"
npm run dev
```

### ops-admin

`npm run dev` 的 API 是 `http://127.0.0.1:3100`，管理台是 `http://127.0.0.1:5180`。未设 `PORT` 的裸进程（`npm start` / `node src/server/index.ts`）默认仍是 `3000`。

```bash
curl -s http://127.0.0.1:3100/api/auth/session \
  -H "Authorization: Bearer $OMC_ADMIN_TOKEN"
```

### 企业登录（member）

```bash
curl -s -X POST http://127.0.0.1:3100/api/company/auth/email/start \
  -H 'content-type: application/json' \
  -d '{"email":"admin@company.internal"}'

curl -s -X POST http://127.0.0.1:3100/api/company/auth/email/verify \
  -H 'content-type: application/json' \
  -d '{"email":"admin@company.internal","code":"000000"}'
# → { token, member, teams, defaultTeamId }

curl -s http://127.0.0.1:3100/api/me \
  -H "Authorization: Bearer $TOKEN"
```

管理台 Web：`npm run dev` 后打开 `http://127.0.0.1:5180`；企业页用 sessionStorage `omc_member_token`。  
控制台已解锁时，企业页可 `ensureMemberSessionForConsole` 静默 bootstrap，减少二次登录。

路径全表见 [API-NOTES.md](./API-NOTES.md)。  
导航：企业账号 `/members` · 团队 `/team` · 企业设置 `/org-config`（见 [TEAM-ISOLATION.md](./TEAM-ISOLATION.md)）。
