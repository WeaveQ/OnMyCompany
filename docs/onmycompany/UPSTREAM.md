# 外部同步（工程内部）

本文件仅供维护者合并外部安全修复 / provider 补丁时参考，**不是产品对外叙事**。

## Pin

| 项 | 值 |
|----|-----|
| 外部源 remote 名 | `upstream`（若已配置） |
| 初始化 pin | `01653dc4f80d7ec7738ff0e3ca8606d2cca17465` |
| 许可 | Apache-2.0 |

日常开发以本仓 `origin` 为准。不要把内网密钥、客户配置推到任何公开 remote。

## 代码边界

| 目录 | 策略 |
|------|------|
| `src/company/**` · `docs/onmycompany/**` | 产品自有 |
| `src/server/*` 挂载点 | 尽量小 diff |
| `src/core/**` · `src/providers/**` | 安全修复优先合入；产品逻辑不进 providers |
| `web/` | 产品 UI 以自有为准 |
| `package.json` name | 保持 `@weaveq/onmycompany` |

## 合入节奏

1. `git fetch upstream`（若配置了）  
2. 分支 `sync/YYYYMMDD` 上 merge / rebase  
3. `npm run fix-check` + 冒烟  
4. 更新本文件 pin  

## 环境变量

产品只写 `OMC_*`。废弃别名见 [ENV.md](./ENV.md)。
