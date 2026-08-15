import { defineConfig } from "vitepress";

function normalizeBase(raw) {
  const s = (raw || "/").trim() || "/";
  return s.endsWith("/") ? s : `${s}/`;
}

const base = normalizeBase(process.env.DOCS_BASE);

export const handbookAppendixItems = [
  { text: "系统架构", link: "/Architecture" },
  { text: "工程文档入口", link: "/onmycompany/README" },
  { text: "API 路径", link: "/onmycompany/API-NOTES" },
  { text: "环境变量", link: "/onmycompany/ENV" },
  { text: "角色矩阵", link: "/onmycompany/RBAC" },
  { text: "Bootstrap", link: "/onmycompany/BOOTSTRAP" },
  { text: "配置 schema", link: "/onmycompany/CONFIG-SCHEMA" },
  { text: "桌面契约", link: "/onmycompany/DESKTOP-CONTRACT" },
  { text: "成员开局", link: "/onmycompany/MEMBER-ONBOARDING" },
  { text: "团队隔离", link: "/onmycompany/TEAM-ISOLATION" },
  { text: "OmniRoute 边车", link: "/onmycompany/OMNIROUTE-SIDECAR" },
  { text: "Skills 计划", link: "/onmycompany/SKILLS-PLAN" },
  { text: "路线图", link: "/onmycompany/ROADMAP" },
  { text: "网关观测", link: "/onmycompany/GATEWAY-OBSERVABILITY-PLAN" },
  { text: "初始化检查表", link: "/onmycompany/INIT-CHECKLIST" },
  { text: "OMC 开发计划", link: "/plan/OMC-DEV-PLAN" },
  { text: "Runtime API", link: "/runtime-api" },
  { text: "凭据", link: "/credentials" },
];

export const handbookNav = [
  { text: "简介", link: "/" },
  { text: "快速开始", link: "/quickstart" },
  { text: "控制台", link: "/console" },
];

const sidebar = [
  {
    text: "入门指南",
    items: [
      { text: "简介", link: "/" },
      { text: "快速开始", link: "/quickstart" },
    ],
  },
  {
    text: "功能指南",
    items: [
      { text: "控制台与角色", link: "/console" },
      { text: "企业账号与团队", link: "/accounts" },
      { text: "连接器与网关", link: "/connections" },
      { text: "Skills、专家与模型", link: "/catalog" },
      { text: "策略、配额与 API Key", link: "/policy" },
      { text: "计量、运行与审计", link: "/observe" },
      { text: "员工与桌面", link: "/desktop" },
    ],
  },
  {
    text: "排障",
    items: [{ text: "排障与边界", link: "/faq" }],
  },
  {
    text: "工程附录",
    collapsed: true,
    items: handbookAppendixItems,
  },
];

export default defineConfig({
  srcDir: "../docs",
  srcExclude: [
    "README.md",
    "README.zh-CN.md",
    "README.zh-TW.md",
    "quickstart.md",
    "design/**",
    "upstream/**",
    "onmycompany/diagrams/**",
    "onmycompany/_selftest-proof-2026-08-03.md",
    "onmycompany/ARCH-AUDIT-2026-08-03.md",
    "onmycompany/UPSTREAM.md",
    "plan/README.md",
    "plan/OMA-DEV-PLAN.md",
    "cloudflare.md",
    "fly-io.md",
    "docker-ghcr.md",
    "docker-ghcr.zh-CN.md",
    "gmail-oauth-sdk.md",
    "gmail-oauth-sdk.zh-CN.md",
    "sdk-cli.md",
  ],
  rewrites: {
    "user-guide/index.md": "index.md",
    "user-guide/:page.md": ":page.md",
  },
  title: "OnMyCompany",
  description: "企业 Agent 管控面与外发 Gateway 使用说明",
  lang: "zh-CN",
  base,
  cleanUrls: true,
  ignoreDeadLinks: [
    (url) => url.includes("AGENTS"),
    (url) => url.includes("UPSTREAM"),
    (url) => url.includes("OMA-DEV-PLAN"),
  ],
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${base}favicon.png` }],
    ["meta", { name: "theme-color", content: "#292929" }],
  ],
  themeConfig: {
    siteTitle: "OnMyCompany",
    nav: handbookNav,
    sidebar,
    outline: {
      level: [2, 3],
      label: "快速导航",
    },
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "搜索", buttonAriaLabel: "搜索文档" },
          modal: {
            noResultsText: "没有结果",
            resetButtonTitle: "清除",
            footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" },
          },
        },
      },
    },
    docFooter: { prev: "上一页", next: "下一页" },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "主题",
    lightModeSwitchTitle: "切换到浅色",
    darkModeSwitchTitle: "切换到深色",
    socialLinks: [],
  },
});
