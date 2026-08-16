# OnMyCompany 文档站

产品使用说明的 VitePress 站。正文在 [`docs/user-guide/`](../docs/user-guide/)，工程附录读 [`docs/onmycompany/`](../docs/onmycompany/)。

```bash
npm run dev:docs     # http://127.0.0.1:5181
npm run build:docs
npm run preview:docs
```

本地默认 `base=/`。GitHub Pages 子路径构建：

```bash
DOCS_BASE=/OnMyCompany/ npm run build:docs
```

不要和 `npm run dev`（API `:3100` + 管理台 `:5180`）抢端口。

顶栏「控制台」进的是手册里的控制台说明页，不是本机 `127.0.0.1:5180`。管理台要自己 `npm run dev` 打开。

GitHub Pages：合并 `deploy-docs.yml` 后，在仓库 Settings → Pages → Source 选 GitHub Actions。对外地址在启用前会 404。
