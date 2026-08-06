# 路线图（M0–M7 + Skills + gap-close + G0/G1a/G2 + pilot gaps）

工程 SoT 摘要。完整矩阵见知识库。  
**Skills 专项**：[SKILLS-PLAN.md](./SKILLS-PLAN.md)  
**网关观测**：[GATEWAY-OBSERVABILITY-PLAN.md](./GATEWAY-OBSERVABILITY-PLAN.md)  
**API**：[API-NOTES.md](./API-NOTES.md)  
**桌面契约**：[DESKTOP-CONTRACT.md](./DESKTOP-CONTRACT.md)

**状态日**：2026-08-04（修订：补齐组织成员生命周期、审计事件台、桌面 2b 最小客户端）

---

## 总览

```text
M0–M7 / S1–S5 / P1–P2                        ✅ Company 服务端 MVP
导航 IA：应用连接主入口；人员=状态筛选（未激活/已启用/已停用）   ✅
缺口收口                                     ✅ P7/P5/A2/C5/W6
网关 G0 / G1a / G2                           ✅ 主路径
Office catalog                               ✅
组织成员生命周期（角色 / 停用 / 删除）         ✅
审计事件控制台 /audit-events                 ✅
桌面 company 2b 最小客户端                   ✅ 客户端+持久化+镜像+单测
  · company-settings.json 持久化 BaseUrl/session
  · company-client 登录→拉配置→token→/v1
  · profiles/company/config 镜像（无 secret）
  · Electron IPC 薄封装（onmyagent:company*）
桌面全链路 UI 设置页 / 全 runtime egress 强制  ⬜ 非本批（见延期）
```

## 业务里程碑

| 里程碑 | 状态 |
|--------|------|
| **MVP-Gateway** | ✅ |
| **MVP-Org** | ✅ |
| **MVP-Console** | ✅ |
| **MVP-Skills** | ✅ |
| **Gap-close** | ✅ |
| **G0 · G1a · G2** | ✅ 主路径（G1b/G3 可选未做） |
| **Org member lifecycle** | ✅ |
| **Audit product surface** | ✅ |
| **Desktop company 2b (client)** | ✅ 模块 + 单测 + IPC；完整设置 UI 可后补 |
| **试点可交（服务端）** | ✅ |
| **端到端桌面设置向导** | ⏳ 客户端就绪；产品 UI 可增强 |

## 下一阶段（可选 / 未强制）

| 项 | 说明 |
|----|------|
| 桌面设置页可视化「连接公司」 | IPC 已有；UI 表单可后续补 |
| **G1b LLM Plan** | 默认关 |
| **G3 软配额** | 可选 |
| 真飞书 OAuth 换票 | stub |

## 明确延期（P2）

| 项 | 说明 |
|----|------|
| 真飞书 OAuth 换票 | stub；需生产凭证 |
| SMTP 运营监控 | 可选 URL；无告警体系 |
| OpenMeter / Lago / 商业预扣账单 | 默认不做 |
| Experts 货架对齐 Skills | 后置 |
| 桌面全链路 egress `gateway_required` 全 runtime 强制 | deferred |
| G1b LLM 反代 / G3 软配额 | 可选 |
| 私有 git origin / compose CI | 运维 |

## 完成度粗算

| 块 | 进度 |
|----|------|
| Gateway | ~97% |
| 企业身份 + OrgConfig + 成员生命周期 | ~95% |
| 策略/归因 | ~92% |
| 管理台（含审计事件） | ~96% |
| Skills | ~90% |
| **桌面 company 客户端 / 镜像** | **~70%**（2b 最小路径 ✅；设置 UI / 全 egress 未满） |
| 观测计量 G2 | ~90% |

**服务端试点主路径：完成。**  
**桌面 2b：客户端与契约路径完成（单测驱动）；完整 Electron 产品向导可后续。**
