# Design system — OnMyCompany

OMA 同款体例：`DESIGN.md`（契约）+ `preview.html`（可视目录）。**预览 CSS 独立**，不改 `web/src/styles/*` 产品样式。

## 打开预览

```bash
open docs/design/preview.html
# 或
open docs/design/preview-dark.html
```

浏览器直接打开即可（本地 `file://`）。

## 文件

| 文件                                                                                                   | 作用                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| [`../../DESIGN.md`](../../DESIGN.md)                                                                   | 权威视觉契约（Agent + 人）                        |
| [`preview.html`](./preview.html)                                                                       | Light 预览（对齐 OMA `docs/design/preview.html`） |
| [`preview-dark.html`](./preview-dark.html)                                                             | Dark 预览                                         |
| [`preview.css`](./preview.css)                                                                         | **仅预览**用样式，不进应用包                      |
| [`tokens-snapshot.json`](./tokens-snapshot.json)                                                       | token 快照（与 org config 同源）                  |
| [`../../data/org/default/config/design/tokens.json`](../../data/org/default/config/design/tokens.json) | 后台 org config 副本                              |
| [`../../web/src/styles/theme.css`](../../web/src/styles/theme.css)                                     | 产品实现 SoT                                      |

## 选型（awesome-design-md）

1. **Cal.com** — 白底 + 近黑 CTA + 8px 控件
2. **Vercel** — 灰阶 / 轻 elevation（不要营销 pill / mesh）
3. **Linear** — 暗色表面阶梯 + 强调色克制；brand `#7c9dff` 只做 ring

对照桌面端：OnMyAgent 的 `onmyagent/docs/design/preview.html` 与根目录 `onmyagent/DESIGN.md`。

## 约束

见 [`web/PRODUCT.md`](../../web/PRODUCT.md)：企业管控台，不是聊天工作台 / 营销站。改视觉先改 `DESIGN.md` + 预览，再动产品 CSS。
