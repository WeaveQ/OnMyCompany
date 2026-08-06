# Contributing — OnMyCompany

> **许可**：本仓库为 **非商用源码可见**（见 `LICENSE`）。贡献即同意按该许可授权；**商用部署须 WeaveQ 单独协议**。  
> 配套桌面 [OnMyAgent](https://github.com/WeaveQ/OnMyAgent) 为 Apache-2.0，条款不同。

## Development setup

```bash
cp .env.example .env   # optional
npm install
npm run dev            # API :3100 + web :5180（见 .env）
npm test               # 全量
npm run ci             # 与 GitHub Actions 一致
```

读完：

1. [AGENTS.md](AGENTS.md)  
2. [docs/onmycompany/README.md](docs/onmycompany/README.md)  
3. [docs/onmycompany/RBAC.md](docs/onmycompany/RBAC.md) · [TEAM-ISOLATION.md](docs/onmycompany/TEAM-ISOLATION.md)  

## Before a merge request

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

## Where to put code

| 改动类型 | 位置 |
|----------|------|
| 企业身份 / OrgConfig / 审计 | `src/company/` |
| 挂载路由 | `src/server/` 薄改 |
| Gateway 执行 / providers | 有理由再改 `src/core` / `src/providers` |
| 管理台 | `web/` |
| 产品文档 | `docs/onmycompany/` |

## Adding providers

Source of truth: `src/providers/<service>/definition.ts` (+ actions/executors).  
Then `npm run generate:catalog`.  
生产环境用 `OMC_ALLOWED_ACTIONS` 等收紧执行面。

## Secrets

Do not commit tokens, keys, or customer configuration.

## Third-party rights

Do not commit third-party logos, icons, screenshots, or brand assets without rights.
