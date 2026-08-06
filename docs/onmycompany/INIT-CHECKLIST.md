# 初始化检查表

用于确认「文档与仓库身份」就绪，可进入 M0 代码脚手架。

## 身份与文档

- [x] README 品牌 OnMyCompany
- [x] AGENTS.md 铁律 + 命令 + 边界
- [x] `docs/Architecture.md`（对齐 OMA 分层与配置通道）
- [x] `CONFIG-SCHEMA` / `DESKTOP-CONTRACT`
- [x] `docs/onmycompany/*` 路线图 / RBAC / bootstrap / API / upstream
- [x] 历史 README/AGENTS 归档到 `docs/upstream/`
- [x] package.json 更名为 `@weaveq/onmycompany`
- [x] `.env.example`
- [x] 物理目录 `open-connector` → `onmycompany`
- [x] git `upstream` = oomol-lab/onmycompany（原 origin 已改名）
- [ ] 私有 `origin`（团队自建 remote 后 `git remote add origin …`）

## 运行

- [ ] `npm install` 成功
- [ ] `npm run dev`：API :3000、Web :5180
- [ ] `curl /health` ok
- [ ] hackernews action 冒烟 ok
- [ ] （可选）`npm run fix-check`

## M0 代码

- [x] `src/company/` 模块
- [x] `GET /api/company/health`（同进程；公开路径）
- [x] 空 OrgConfig 磁盘 layout（`ensureOrgConfigLayout` → `$OMC_DATA_DIR/org/default/config`）
- [ ] provider allowlist 运维说明（可链 configuration.md）

## 桌面并行（onmyagent · 见 DESKTOP-CONTRACT）

- [x] 2a：`profiles/local` + migrate copy-not-delete
- [ ] `companyBaseUrl` 设置项占位
- [ ] mock org config fixture（形状 = CONFIG-SCHEMA）
- [ ] 未登录不建 `profiles/company`、零企业流量
- [ ] 2b：登录 / activeProfile / 拉 config（依赖本仓 M1–M2）
