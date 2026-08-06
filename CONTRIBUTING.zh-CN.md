# 贡献指南 — OnMyCompany

[English](CONTRIBUTING.md) · **简体中文**

> **许可**：本仓库为 **非商用源码可见**（见 `LICENSE`）。贡献即同意按该许可授权；**商用部署须 WeaveQ 单独协议**。  
> 配套桌面 [OnMyAgent](https://github.com/WeaveQ/OnMyAgent) 为 Apache-2.0，条款不同。

## 开发环境

```bash
cp .env.example .env   # 可选
npm install
npm run dev            # API :3100 + web :5180（见 .env）
npm test               # 全量
npm run ci             # 与 GitHub Actions 一致
```

读完：

1. [AGENTS.md](AGENTS.md) / [中文](AGENTS.zh-CN.md)
2. [docs/onmycompany/README.md](docs/onmycompany/README.md)
3. [docs/onmycompany/RBAC.md](docs/onmycompany/RBAC.md) · [TEAM-ISOLATION.md](docs/onmycompany/TEAM-ISOLATION.md)

## 合并前

```bash
npm run ci
# 或分层：
npm run test:company && npm run test:web
npm run check:docs   # 若改了企业路由
```

涉及 provider 定义：

```bash
npm run generate:catalog
```

## 代码放哪里

| 改动类型                    | 位置                                    |
| --------------------------- | --------------------------------------- |
| 企业身份 / OrgConfig / 审计 | `src/company/`                          |
| 挂载路由                    | `src/server/` 薄改                      |
| Gateway 执行 / providers    | 有理由再改 `src/core` / `src/providers` |
| 管理台                      | `web/`                                  |
| 产品文档                    | `docs/onmycompany/`                     |

## 添加 provider

Source of truth: `src/providers/<service>/definition.ts`（+ actions/executors）。  
然后 `npm run generate:catalog`。  
生产环境用 `OMC_ALLOWED_ACTIONS` 等收紧执行面。

## 密钥

不要提交 token、密钥或客户配置。

## 第三方权利

未经授权，不要提交第三方 logo、图标、截图或品牌素材。
