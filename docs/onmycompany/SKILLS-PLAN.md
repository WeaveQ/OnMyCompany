# Skills 产品计划：企业设置 × 个人发布

> 管理台入口现名 **企业设置**（`/org-config`）+ **Skills** 页；下文「组织配置」= 历史说法，等同企业设置 / OrgConfig。

| Field | Value |
| --- | --- |
| Status | **draft plan** · 2026-08-03 |
| 对照 UI | ① 列表 Tab 组织/个人 ② **添加 Skill 包**弹窗：公开/我的 + 搜索 + 添加/已添加 |
| 关联 | [CONFIG-SCHEMA.md](./CONFIG-SCHEMA.md) · [DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md) · [ROADMAP.md](./ROADMAP.md) |
| 桌面 | OMA `profiles/*/config/skills` · marketplaces 2a 已铺 |

---

## 1. 一句话

**组织 Skills = 公司配好的能力包（全员/角色可见）；个人 Skills = 员工自己装/发的能力包（本机优先，可选上企业个人区）。**  
管理台与桌面都按「两层 + 同构 schema」做，不要做成两套互不兼容的技能系统。

---

## 2. 从截图抽象的能力清单

| UI 元素 | 产品含义 | 我们的落点 |
|---------|----------|------------|
| Tab **组织配置** | 团队/组织下发的 Skills | OnMyCompany OrgConfig `skills/` |
| Tab **个人发布** | 个人上传/维护的 Skills | 桌面 local / 可选 UserData 或 `members/{id}/skills`（后置） |
| 列表卡片 | 名称、来源/版本、可见性标签（如「公开」） | Catalog 元数据 + 发布范围 |
| **+ 添加** | 打开「添加 Skill 包」弹窗（见 §4.3） | 从 **公开货架** 或 **我的** 选包 → **关联到当前组织** |
| 查看 | 打开详情 / SKILL.md / 版本 | Catalog detail API |
| 分享 | 复制链接 / 给同事可见（组织内） | 组织侧为主；个人分享后置 |
| 删除 | 从当前层卸载 | 组织=admin；个人=自己 |

---

## 3. 分层与真相源（钉死）

```text
┌─────────────────────────────────────────────────────────┐
│  组织 Skills（Org）                                       │
│  真相：OnMyCompany  data/org/default/config/skills/       │
│  谁写：org-admin                                          │
│  谁读：登录成员 → 镜像到桌面 profiles/company/config/skills │
│  形态：公司「能力货架」+ 已启用列表                         │
└─────────────────────────────────────────────────────────┘
                          │ 登录下发（只读镜像）
                          ▼
┌─────────────────────────────────────────────────────────┐
│  桌面生效 Skills                                          │
│  activeProfile=company：组织 Skills ∪ 本机个人叠加(规则)   │
│  activeProfile=local：仅 profiles/local/config/skills     │
└─────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────┴───────────────────────────────┐
│  个人 Skills（Mine）                                      │
│  真相（MVP）：本机 profiles/local/config/skills + mine     │
│  可选后置：Company UserData /me/skills 备份               │
│  谁写：本人                                               │
│  company 模式：默认可叠加；policy 可禁个人 Skill            │
└─────────────────────────────────────────────────────────┘
```

| 层 | 写 | 读 | 不上 |
|----|----|----|------|
| 组织 | org-admin 上传/勾选启用 | 全体成员（或按角色） | secret、对话、工作区 |
| 个人 | 本人上传/勾选 | 本人；分享范围另定 | 不进 OrgConfig 整包 |

与现有专家树对齐：组织 ≈ `experts/installed`，个人 ≈ `experts/mine`。  
Skills 建议对称：

```text
config/skills/
  installed/     # 组织已启用（或个人已安装的「正式」副本）
  available/     # 可选：组织货架未启用条目的索引（仅元数据）
  mine/          # 个人发布/上传
```

MVP 可先只做 `installed/` + `mine/`，货架用 catalog 列表表达。

---

## 4. 两种「添加」方式

### 4.1 上传（Upload）

| 项 | 组织 | 个人 |
|----|------|------|
| 入口 | 管理台「企业设置」/ Skills 页 + 添加 | 桌面 Skills 页 / 管理台「个人」Tab（后置） |
| 包格式 | 与 OMA 一致：目录或 zip（含 `SKILL.md` + 资源） | 同左 |
| 存储 | `$DATA/org/.../config/skills/installed/<id>/` | 本机 `profiles/local/.../skills/mine/<id>/` |
| 校验 | schema、大小上限、禁止可执行二进制（可后置加固） | 同左 |
| 版本 | `name@version` 或 semver 目录名 | 同左 |
| 审计 | 配置变更事件（C8） | 本机 only；上云后写 UserData 审计 |

**分期**：P1 管理台 zip 上传；P0 可用 **目录扫描**（运维 rsync 后点「刷新」）先跑通。

### 4.2 勾选 / 从目录安装（Select）

| 项 | 组织 | 个人 |
|----|------|------|
| 货源 | 组织「可用 Skills」目录 / 内置包 / 已上传未启用 | 本机 marketplace、已下载包、组织已下发只读库 |
| 动作 | Admin 勾选 → 写入 **已启用** 集合（manifest 或 `enabled.json`） | 用户勾选 → 装入 local installed/mine |
| 与上传关系 | 上传进货架；勾选决定是否下发给全员 | 上传即个人可用；勾选控制是否进当前会话解析 |

建议元数据：

```json
// config/skills/enabled.json（组织）
{
  "enabled": [
    {
      "id": "gpt-image-2",
      "packageId": "@user/gpt-image-2@1.1.1",
      "ref": "installed/gpt-image-2@1.1.1",
      "source": "public_registry | personal | upload",
      "visibility": "org"
    }
  ]
}
```

### 4.3 「添加 Skill 包」弹窗（对标第二张图 · 主路径）

文案心智：

> 选择**公开** Skill 包，或从**你的个人账号**中选择 Skill 包，**关联到当前团队/组织**。

```text
┌─ 添加 Skill 包 ─────────────────────────── ✕ ─┐
│ 副标题：公开包 或 我的包 → 关联到当前组织        │
│ [ 公开 | 我的 ]              [ 搜索 Skills… ]   │
│ ┌───────────────────────────────────────────┐ │
│ │ 图标  名称 [公开]  @scope/name@version      │ │
│ │       n Skills              [添加|已添加]   │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

| 元素 | 含义 | 我们的实现 |
|------|------|------------|
| Tab **公开** | 可被组织引用的公共/内置/公司货架包 | `GET /api/catalog/skills?scope=public`（或 org registry） |
| Tab **我的** | 当前登录人已有的个人包 | 个人 skills 列表；Admin 可把「我的」提升关联到组织 |
| 搜索 | 按名 / packageId 过滤 | query `q=` |
| 行：名称 + 公开标签 | 展示名 + 可见性 | catalog 元数据 |
| `@scope/pkg@semver` | 包坐标（类似 npm） | 稳定 `packageId`，落盘目录名由此派生 |
| `n Skills` | 包内 skill 条数 | 解析包内 SKILL 数 |
| **添加** | 未关联 → 点一下关联到**当前组织** | `POST /api/org/skills/enable` 或 copy-into `installed/` |
| **已添加** | 已在组织启用列表 | 禁用按钮 / 可改为「移除」 |

**和「上传」的关系（三者并列，不要混成一个按钮）：**

| 路径 | 用户动作 | 结果 |
|------|----------|------|
| A 从公开选 | 弹窗 · 公开 · 添加 | 组织引用/拷贝该包 → 全员可用 |
| B 从我的选 | 弹窗 · 我的 · 添加 | 个人包 **提升/关联** 到组织（需 admin） |
| C 本地上传 | 弹窗底部或二级「上传 zip」 | 新包进组织 installed，并标已添加 |

**状态机（单包）：**

```text
未添加 --[添加]--> 已添加（写入 org enabled + 确保包在 installed）
已添加 --[移除/删除]--> 未添加（仅解绑 或 连包删除，产品要二选一说清）
```

MVP 建议：**添加 = 绑定到组织（enable）**；删除在列表页做「从团队移除」，默认 **不解绑包文件** 直到二次确认「彻底删除」。

**权限：**

| 角色 | 公开 Tab | 我的 Tab | 添加→组织 |
|------|----------|----------|-----------|
| org-admin | 浏览 + 添加 | 浏览自己的 + 添加 | ✅ |
| member | 只读浏览（可选） | 只读自己的 | ❌（或仅「申请」后置） |

---

## 5. 产品页面信息架构

### 5.1 OnMyCompany 管理台（企业设置 / Skills）

不要只做 JSON 文本框。Skills 子页建议：

```text
组织配置
  ├── 概览（version / 最近变更）
  ├── Skills          ← 本计划主战场
  │     Tab: 已启用 | 货架/全部 | （高级）原始目录
  ├── 专家 Experts    （同构模式，可复用交互）
  ├── 模型 Models
  └── 策略 Policy
```

**Skills · 组织 Tab（对标截图「组织配置」）**

- 列表：图标、名称、版本、标签（公开/内部）、操作（查看 / 分享 / 删除）
- 主按钮：**+ 添加** → **「添加 Skill 包」弹窗**（§4.3）  
  - Tab 公开 / 我的 · 搜索 · 添加/已添加  
  - 二级：上传 zip（路径 C）  
- 空态：引导 Admin「添加」第一个团队 Skill  

**Skills · 个人 Tab（对标「个人发布」）**

- MVP：**只读说明**「个人 Skills 在桌面 OnMyAgent 管理」+ 链接文案  
- P1：若做服务端个人区，再列表 `members/{id}/skills`（需登录 member）  

### 5.2 OnMyAgent 桌面（消费 + 个人发布）

| 模式 | 行为 |
|------|------|
| 未登录 local | 只见/改 local skills；无组织 Tab 数据 |
| 已登录 company | Skills UI：组织（只读列表，来自镜像）+ 个人（可写） |
| 解析 | `activeConfig` 合并规则：组织强制启用 ∪ 个人（若 policy 允许） |

Policy 开关建议（`policy.json`）：

```json
{
  "skills": {
    "allowPersonal": true,
    "personalCannotOverrideOrg": true
  }
}
```

---

## 6. API 草案（增量，挂现有 OrgConfig）

| 方法 | 路径 | 谁 | 说明 |
|------|------|-----|------|
| GET | `/api/catalog/skills` | member | 组织已启用 + 元数据列表 |
| GET | `/api/catalog/skills/:id` | member | 详情 / 正文（策略允许时） |
| POST | `/api/org/skills/upload` | org-admin | multipart zip → installed |
| GET | `/api/catalog/skills?scope=public\|mine` | member+ | 弹窗双 Tab 数据源 |
| POST | `/api/org/skills/enable` | org-admin | body: `{ packageId }` 或 `{ ids: [] }` → **关联到当前组织**（= 弹窗「添加」） |
| POST | `/api/org/skills/disable` | org-admin | 取消关联（列表「移除」；默认可不删盘） |
| DELETE | `/api/org/skills/:id` | org-admin | 彻底删除包 + 启用项（二次确认） |
| POST | `/api/org/skills/upload` | org-admin | 弹窗路径 C：zip |
| POST | `/api/org/config/scan` | org-admin | 目录同步刷新 |
| （后） | `/api/me/skills/*` | member | 个人发布/备份（弹窗「我的」数据源） |

GET `/api/org/config` 的 `skills` section 继续给桌面整包镜像；Catalog 给管理台列表 UI。

---

## 7. 分期（可执行）

### S0 · 现状（已有）

- OrgConfig 空 `skills/` 目录 + 配置 JSON 编辑壳  
- 桌面 2a local skills 路径  

### S1 · 组织列表可读（1 周内量级）

- 扫描 `skills/installed` 生成 catalog 列表 API  
- 管理台 Skills 页：列表 + 查看详情（读 SKILL.md）  
- 无上传：运维拷目录 +「扫描刷新」  

### S2 · 「添加 Skill 包」弹窗 + 关联到组织（约 1–1.5 周）

- 弹窗：公开 / 我的 · 搜索 · **添加 / 已添加**  
- `enabled.json` + `POST enable/disable`（添加=关联团队）  
- 桌面 company 镜像只含已关联包  
- 列表「移除」= disable  

### S3 · 组织上传 + 货架充实（约 1–2 周）

- zip 上传（弹窗二级入口）  
- 公开货架数据源（内置 + 已上传）  
- 审计：谁添加/上传了哪个 packageId  
- 分享：组织内复制 packageId  

### S2 验收补一条

| # | 场景 | 通过 |
|---|------|------|
| 2b | Admin 打开添加弹窗，从公开点「添加」 | 按钮变「已添加」；组织列表出现该包 |

### S4 · 个人发布（桌面优先，约 1–2 周）

- OMA：个人 Tab 上传/管理 mine  
- company 模式叠加规则 + policy.allowPersonal  
- 管理台个人 Tab 可后置或只读提示  

### S5 · 增强（后置）

- 角色可见性、审批后上架、商店同步、分享外链、病毒扫描  

---

## 8. 验收场景

| # | 场景 | 通过 |
|---|------|------|
| 1 | Admin 上传或扫描进组织 Skill | 列表可见版本号 |
| 2 | Admin 勾选启用 | 成员拉 org config 后桌面 company 可见 |
| 3 | 成员未登录 | 无组织 Skills HTTP；local 个人仍可用 |
| 4 | policy 禁止个人 | company 模式不加载 mine |
| 5 | 删除组织 Skill | 启用列表与磁盘一致；审计有记录 |
| 6 | 个人上传（桌面） | 不影响其他成员组织列表 |

---

## 9. 非目标（本计划不展开）

- 公网技能商店计费 / 「邀请得额度」类增长玩法  
- 跨公司分享外链  
- 用对话内容当 Skill 包  
- 在 Electron 内再做一套组织真相源  

---

## 10. 建议下一步（实现顺序）

1. **S1**：catalog list + 管理台 Skills 列表（替代纯 JSON）  
2. **S2**：enabled 勾选 + 下发镜像过滤  
3. **S3**：zip 上传  
4. **S4**：桌面个人 Tab（onmyagent 仓，可并行）  

当前 Org 配置页可保留 policy/models JSON；**Skills 单独做列表交互**，与截图心智一致。

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-03 | 初稿：对标组织/个人双 Tab、上传 vs 勾选、分层与分期 S0–S5 |
| 2026-08-03 | 补 §4.3：添加 Skill 包弹窗（公开/我的、packageId、添加/已添加、关联到组织） |
