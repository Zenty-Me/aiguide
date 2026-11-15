# Zenty AI Guide

面向中文开发者的 AI 编程与 Agent 开发实战指南：Codex、Claude Code、MCP、Skills 与自动化流水线。所有教程以「一次真实任务 → 可验证结果」为组织方式，站点为纯静态输出，搜索在浏览器内完成，不收集访客数据。

目标域名：<https://aiguide.zenty.top>（首版本地构建完成，尚未部署上线；线上状态需所有者部署后确认）

## 技术栈

- Astro 7（静态输出，默认不加载前端框架）
- TypeScript + Tailwind CSS 4（通过 `@tailwindcss/vite`）
- Markdown 内容集合（`src/content/articles/*.md`，glob loader）
- 站内搜索：构建期生成 `/search-index.json`，运行时本地匹配
- 测试：Node 断言式冒烟测试 + playwright-core 浏览器测试

## 本地开发

```sh
npm install          # 或 npm ci（使用锁定版本）
npm run dev          # http://localhost:4321
npm run check        # astro check（类型与模板检查）
npm run build        # 产出 dist/
npm run preview      # 预览构建结果
```

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 生产构建到 `dist/` |
| `npm run check` | Astro/TypeScript 检查 |
| `npm run test:smoke` | 构建产物冒烟测试：路由、链接与锚点、元信息、JSON-LD、搜索数据、RSS、sitemap |
| `npm run test:e2e` | 浏览器测试：搜索、主题持久化、复制代码、移动端导航、溢出与报错 |
| `npm test` | 依次运行 smoke 与 e2e |
| `npm run og` | 重新生成 `public/og-default.png`（需要 sharp） |

浏览器测试使用本机已安装的 Chrome 或 Edge（可用 `CHROME_PATH` 指定）。在 WSL 中运行时会自动转交 Windows 侧浏览器执行，脚本自行启动静态服务器。

## 目录结构

```
src/
  pages/                 路由（首页、主题、学习路线、教程、搜索、关于、更新日志、404）
  components/            页头、页脚、文章行、路线图、目录、阅读进度等
  layouts/               页面骨架（meta、OG、JSON-LD、主题首屏初始化）
  content/articles/      教程正文（Markdown）
  data/paths.ts          六条学习路线的编排
  data/categories.ts     主题定义
  content.config.ts      集合 schema
  lib/                   搜索、SEO 辅助
  scripts/               主题、导航、搜索、复制、目录、进度
  styles/global.css      设计变量与组件样式
public/                  CNAME、.nojekyll、favicon、OG 图
tests/                   smoke.mjs、e2e.mjs、静态服务器
scripts/generate-og.mjs  OG 图生成
```

## 内容约定

新增教程只需在 `src/content/articles/` 放入 `<id>.md`，URL 自动为 `/articles/<id>/`。frontmatter：

```yaml
---
title: 标题
description: 一句话摘要，用于列表与 meta description
category: codex # codex | claude-code | agent | mcp | skills | automation
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门 # 入门 | 进阶
order: 1
tags: [Codex, CLI]
featured: false
---
```

学习路线按主题分为六条：Codex、Claude Code、MCP、Skills、Agent 与自动化。顺序在 `src/data/paths.ts` 中维护，每条路线的步骤与文章一一对应；文章缺失时路线步骤会显示「待发布」而不是死链，文章为空时各列表页显示空状态。新增教程时同步更新对应路线的步骤与 `order`，上一篇/下一篇会在同一主题内衔接。

## SEO 维护

- **发布日期与更新时间都要手写。** `publishedAt` 首次发布后不再改；内容有实质修订（新增章节、修正错误、补充命令说明）时把 `updatedAt` 改成当天。只改措辞、标点或排版不必更新。
- **sitemap 的 `lastmod` 来自文章页的 Article `dateModified`。** 构建时 `astro.config.mjs` 的 sitemap 集成从已生成的 `/articles/<id>/index.html` 读回该值，因此两处永远一致；非文章页故意不输出 `lastmod`，避免用构建时间冒充内容更新时间。改日期只改 frontmatter，不用动配置。
- **标题与描述唯一。** 冒烟测试会检查所有可索引页面的 `<title>` 与 meta description 不重复，新增页面后跑 `npm run test:smoke` 即可发现冲突。
- **可索引范围。** `/search/` 与 404 输出 `noindex, follow` 并已从 sitemap 排除；`robots.txt` 不屏蔽 `/search/`，否则搜索引擎读不到 noindex。
- **尚未做站后验证。** 目前只验证了本地构建产物，没有部署，也没有在 Search Console、Bing Webmaster Tools 或真实搜索里确认抓取、索引与排名；上线后需人工提交 sitemap、检查覆盖率报告，并观察实际查询表现。

## 部署（GitHub Pages）

仓库内已包含 `.github/workflows/deploy.yml`：`npm ci` → `npm run check` → `npm run build` → `npm run test:smoke`（针对 `dist/` 的产物门禁）→ 上传 `dist` → `deploy-pages`，权限仅 `contents: read`、`pages: write`、`id-token: write`。默认分支为 `main` 时推送即部署。浏览器测试（`npm run test:e2e`）需要本机浏览器，未放进 CI。

### 部署形态限制

本实现只支持**自定义域名根部署**（`https://aiguide.zenty.top/`）。站内链接、canonical、搜索索引地址（`/search-index.json`）、RSS 与 sitemap 都按根路径绝对地址生成，**不支持** `https://<账号>.github.io/<仓库>/` 这类 project 子路径。要支持子路径需要全站改为相对路径或引入 `base` 前缀适配，不在当前范围内；只改 `site`、`base` 与 `CNAME` 并不够。

### 步骤

以下步骤需要仓库所有者按实际情况执行，代码里没有写死账号：

1. 创建仓库并推送本项目，确认默认分支为 `main`；在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 先在 **Settings → Pages → Custom domain** 填入 `aiguide.zenty.top` 并保存；GitHub 随即开始 DNS 检查与证书签发，域名校验状态也在同一页面显示（若提示 unverified，先按提示完成域名验证再继续）。用 Actions 发布时 `public/CNAME` 会被忽略，自定义域名以 Pages 设置为准，该文件仅作声明用途保留。
3. 在域名服务商处为 `aiguide` 添加 **CNAME** 记录，值按 GitHub 文档为 `<你的账号>.github.io`（`USERNAME.github.io` 或 `ORGANIZATION.github.io`，不含仓库名；无法由本项目推断）。同时确认没有多余的 `A`/`AAAA`/`CNAME` 指向其他主机，否则证书会签发失败；若配置了 CAA 记录，需包含 `letsencrypt.org`。
4. **Cloudflare 用户首次部署**：把该 CNAME 记录的 Proxy status 设为 **DNS only（灰云）**。Cloudflare 代理会让流量先经其网络，GitHub 的自动 DNS 检查与 Let's Encrypt 证书签发因此无法完成，常见表现是 `Enforce HTTPS` 不可勾选或 `InvalidDNSError`。证书签发完成、Pages 显示域名检查通过后，再决定是否开启代理；如需开启，需自行确认 Cloudflare 的 SSL/TLS 模式与缓存行为，并重新验证 HTTPS 与重定向。
5. 保存自定义域名后 GitHub 会自动做 DNS 检查并申请 Let's Encrypt 证书，通常几分钟内完成，官方文档说明最长可能需要一小时；若长时间未完成，可移除域名再重新添加以重试签发。
6. 证书生效后勾选 **Enforce HTTPS**，并实际确认 `https://aiguide.zenty.top/` 能访问、HTTP 会跳转 HTTPS、`/articles/codex-first-task/` 等深层链接正常。

依据：[Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)、[Troubleshooting custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)、[Cloudflare DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/)。Cloudflare 代理与 GitHub 证书签发的冲突未写入上述 GitHub 文档，属于基于代理机制与社区实践的说明，部署时以 Pages 页面的实际提示为准。

## 验证记录

最近一次验证的命令与结果、截图位置、遗留风险见 [`docs/verification.md`](docs/verification.md)。

## 说明

站点文字与图形为原创，没有虚构的作者身份、用户评价或统计数据。教程中的命令示例请在本地空仓库先行验证；涉及删除、发布、权限变更的操作，先确认影响范围再执行。
