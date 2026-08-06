# Product — OnMyCompany Admin

## Register

product

## Users

- **org-admin / auditor**：内网企业管理员与审计角色（主路径）。  
- **ops-admin**：运维配置连接密钥与底层调试（高级）。  
- **开发者**：本地调试 Gateway / Action。

## Product Purpose

OnMyCompany 管理台是企业 Agent **管控后台**：组织配置（Skill / 专家 / 模型 / 策略）、连接与 OAuth、执行审计、成员。  
UI 叙事与信息架构应是 **企业管控**，不是通用「连接器开发者控制台」。

## Brand Personality

克制、可信、内网企业工具。清晰优先于营销；安全边界（凭据、策略、归因）显式可见。

## Anti-references

避免营销 hero、装饰性渐变、把调试控件堆成首页。避免与桌面 OnMyAgent 抢「聊天工作台」定位。

## Design Principles

- 主路径优先：**概览 / 应用连接 / 团队**（单列表 + 状态：未激活 / 已启用 / 已停用；全公司为筛选）。  
- 「更多」承载计量、Skills、运行、API Key、组织配置；操作从连接行深链。  
- 策略编辑只走 Org 叙事（企业模式禁 Console 直写 runtime-policy）。  
- 连接页默认 office catalog；强调组织共享、可直接使用（no_auth）、无 secret 回显。  
- 执行状态、拒绝原因（PolicyDecision）、fallback 尝试可理解。

## Accessibility & Inclusion

Target WCAG AA contrast. Keyboard focus, readable fonts, reduced-motion, usable narrow layouts.

## Related

- Repo product docs: `docs/onmycompany/`  
- Desktop companion: OnMyAgent  
