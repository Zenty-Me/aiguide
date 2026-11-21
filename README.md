# Zenty AI Guide

面向中文开发者的 AI 编程与 Agent 开发实战指南：Codex、Claude Code、MCP、Skills 与自动化流水线。所有教程以「一次真实任务 → 可验证结果」为组织方式，站点为纯静态输出，搜索在浏览器内完成；访问统计只用 Cloudflare Web Analytics 的聚合数据，不使用 Cookie，也不做用户画像。

线上地址：<https://aiguide.zenty.top/>（Cloudflare Workers 静态资源 + 自定义域名）

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
| `npm run og` | 重新生成全站社交预览图：`public/og-default.png` 与 `public/og/{articles,guides}/*.png`（需要 sharp，且本机要有中文字体） |

浏览器测试使用本机已安装的 Chrome 或 Edge（可用 `CHROME_PATH` 指定）。在 WSL 中运行时会自动转交 Windows 侧浏览器执行，脚本自行启动静态服务器。

## 目录结构

```
src/
  pages/                 路由（首页、主题、学习路线、教程、搜索、关于、更新日志、404）
  components/            页头、页脚、文章行、路线图、目录、阅读进度等
  layouts/               页面骨架（meta、OG、JSON-LD、主题首屏初始化、Web Analytics 上报）
  content/articles/      教程正文（Markdown）
  content/guides/        「起步」栏目正文（Markdown）
  data/paths.ts          六条学习路线的编排
  data/og-manifest.json  已生成的预览图清单（由 scripts/generate-og.mjs 写出）
  data/categories.ts     主题定义
  content.config.ts      集合 schema
  lib/                   搜索、SEO 辅助
  scripts/               主题、导航、搜索、复制、目录、进度
  styles/global.css      设计变量与组件样式
public/                 favicon、OG 图（og/、og-default.png）、字体、示例文件
wrangler.jsonc          Cloudflare 部署配置（assets、routes）
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

`setupNote: true` 会在正文末尾追加一块「账号与额度」提示，只链接 `/start/`，不出现任何外部商店地址——商业链接仅出现在「起步」指南页。目前挂在需要登录/配置的 9 篇上（安装、Windows 环境、第一次任务、权限、项目上下文、CLAUDE.md 等）。

「起步」是独立集合 `src/content/guides/*.md`，URL 为 `/start/<slug>/`，frontmatter 用 `kicker`（栏目标签）、`order`、`faq`（对象数组，用于 FAQPage 结构化数据）而不是 `category`。它不进入六条学习路线，也不计入主题分类。

学习路线按主题分为六条：Codex、Claude Code、MCP、Skills、Agent 与自动化。顺序在 `src/data/paths.ts` 中维护，每条路线的步骤与文章一一对应；文章缺失时路线步骤会显示「待发布」而不是死链，文章为空时各列表页显示空状态。新增教程时同步更新对应路线的步骤与 `order`，上一篇/下一篇会在同一主题内衔接。

## SEO 维护

- **发布日期与更新时间都要手写。** `publishedAt` 首次发布后不再改；内容有实质修订（新增章节、修正错误、补充命令说明）时把 `updatedAt` 改成当天。只改措辞、标点或排版不必更新。
- **sitemap 的 `lastmod` 来自文章页的 Article `dateModified`。** 构建时 `astro.config.mjs` 的 sitemap 集成从已生成的 `/articles/<id>/index.html` 读回该值，因此两处永远一致；非文章页故意不输出 `lastmod`，避免用构建时间冒充内容更新时间。改日期只改 frontmatter，不用动配置。
- **标题与描述唯一。** 冒烟测试会检查所有可索引页面的 `<title>` 与 meta description 不重复，新增页面后跑 `npm run test:smoke` 即可发现冲突。
- **可索引范围。** `/search/` 与 404 输出 `noindex, follow` 并已从 sitemap 排除；`robots.txt` 不屏蔽 `/search/`，否则搜索引擎读不到 noindex。
- **站后验证待补。** 站点已部署，但尚未在 Search Console、Bing Webmaster Tools 或真实搜索里确认抓取、索引与排名；需人工提交 `https://aiguide.zenty.top/sitemap-index.xml`、检查覆盖率报告并观察实际查询表现。

## 社交预览图（OG）

`npm run build` 会先跑 `node scripts/generate-og.mjs`，为每篇教程与每篇「起步」指南生成一张 1200×630 的预览图，存到 `public/og/<kind>/<slug>.png`，并写出 `src/data/og-manifest.json`。页面通过 `src/lib/og.ts` 的 `ogImageFor()` 查表决定 `og:image`，表里没有的条目回落到 `og-default.png`，因此单独跑 `astro build` 也不会产出死链。

- 标题含中文，生成机必须有中文字体（`Microsoft YaHei` / `PingFang SC` / `Noto Sans CJK SC` 任一）。缺字体时会画出方框，换一台有字体的机器重跑 `npm run og` 即可，图片本身已提交在 `public/og/`。
- 图片随标题与顺序变化：改标题或增删文章后重跑构建，预览图与 `og-manifest.json` 一起更新。
- 缓存：`/og/` 走 Cloudflare Cache Rule（边缘与浏览器各 24h）。改图后等一天自动过期，或在控制台 Purge 该路径。

## 部署（Cloudflare Workers）

线上地址 <https://aiguide.zenty.top/> 由 Cloudflare Worker 提供静态资源，构建产物 `dist/` 不进仓库，本地或 CI 构建后上传：

- `wrangler.jsonc`：`assets.directory` 指向 `dist`，`not_found_handling: "404-page"` 提供自定义 404；`routes` 以 `custom_domain: true` 绑定 `aiguide.zenty.top`。没有 `main`、没有 asset binding，属于纯静态 assets Worker。
- 站点不含任何服务端代码。`http://` → `https://` 由 zone 级 **Always Use HTTPS**（zone 设置 `always_use_https: on`，2026-11-15 开启）在网络层做 301，因此静态请求仍然是免费且不限量的，不消耗 Worker 调用额度。改这个设置需要 zone 编辑权限；关掉它 `http://` 就会重新返回 200。
- 部署命令：`npm run deploy`（`npm run build && wrangler deploy`）；`npx wrangler tail` 可看实时日志。
- **沙箱/受限环境的手工上传。** `wrangler` 需要拉起 esbuild 子进程，在限制 `spawn` 的环境里会 `spawn EPERM`。此时用 `.cf/deploy_assets.py` 走同一套协议：`assets-upload-session`（清单哈希取 sha256 前 32 位并混入 content-type）→ `POST /workers/assets/upload?base64=true`（每个 bucket 返回 202，最后一个返回 201 并带上 completion jwt）→ `PUT /workers/scripts/<name>`（metadata 里带 `assets.jwt`）。注意 content-type 必须逐文件设置，否则整站会以 `application/octet-stream` 下发。
- **边缘缓存不靠 `_headers`。** `public/_headers` 会随资源一起上线，但通过 assets API 部署时 Cloudflare 不解析它（`/_headers` 会作为普通文件 200 返回）。实际生效的是 zone 级规则：Cache Rule 给 HTML `edge_ttl=3600` + stale-while-revalidate、给 `/_astro/*`/`/fonts/*` 1 年、给 `/og/*` 24 小时；Response Header Transform 把这三类的 `cache-control` 改写成对应值，并补 `X-Content-Type-Options: nosniff`、`Referrer-Policy`。这些规则在控制台维护，不在仓库里；换域名或换 zone 时需要重建。
- CI：`.github/workflows/deploy.yml` 在推送到 `main` 时依次跑 `npm ci` → `npm run check` → `npm run build` → `npm run test:smoke`；仓库 Secrets 配了 `CLOUDFLARE_API_TOKEN`（权限 `Workers Scripts:Edit`）才会继续执行 `npx wrangler deploy`，没配就只做校验、跳过部署。浏览器测试（`npm run test:e2e`）需要本机浏览器，不进 CI。

### 部署形态限制

本实现只支持**自定义域名根部署**（`https://aiguide.zenty.top/`）。站内链接、canonical、搜索索引地址（`/search-index.json`）、RSS 与 sitemap 都按根路径绝对地址生成，**不支持** `https://<账号>.github.io/<仓库>/` 这类 project 子路径。要支持子路径需要全站改为相对路径或引入 `base` 前缀适配，不在当前范围内；只改 `site` 与 `base` 并不够。

### 首次绑定与自查

1. 构建：`npm run build`，产物落在 `dist/`。
2. 上传：`npx wrangler deploy`（等同 `npm run deploy`），更新 Worker `aiguide`。
3. 自定义域名由 `wrangler.jsonc` 的 `routes` 声明，首次部署时 Cloudflare 自动在 `zenty.top` 下创建 `aiguide` 的 DNS 记录（橙云代理）并签发证书，不需要手工加 CNAME，也不要把这条记录改成「仅 DNS」。
4. 改域名只需修改 `routes` 后重新 deploy，或在控制台 Workers → Custom Domains 里增删。
5. 上线自查：`/`、`/articles/<id>/`、`/search/`、`/rss.xml`、`/sitemap-index.xml` 返回 200；`http://` 301 到 `https://`（依赖 zone 级 Always Use HTTPS）；随机路径返回自定义 404 页面。
6. 配置了 `routes` 后 `*.workers.dev` 默认关闭；需要预览地址时在 `wrangler.jsonc` 里显式加 `"workers_dev": true`。

## 访问统计（Cloudflare Web Analytics）

统计使用一个**手工创建的独立 Web Analytics 条目**（不是 zone 自动注入那条），代码只落在 `src/layouts/BaseLayout.astro`：

- **加载方式。** 共享布局里一段 `is:inline` 脚本在运行时判断 `location.hostname === 'aiguide.zenty.top'`，成立才向 `<head>` 追加 `https://static.cloudflareinsights.com/beacon.min.js`，并用官方 `data-cf-beacon='{"token":"601363aa5af74968bb98dcf2281b4dfb"}'` 指定归属。`npm run dev`、`*.workers.dev` 预览和本地构建的 E2E 测试（localhost）都命中不了这个判断，不会上报；判断只在浏览器里做，构建期没有分支，也没有新增依赖或服务端代码。
- **条目标识与公开 token。** 控制台里区分条目用的是 `site_tag`（`0bb01cb04fe342c3a5176ea210a9050c`），不写进页面；上面的公开 token（`601363aa5af74968bb98dcf2281b4dfb`）会出现在每个访客拿到的 HTML 里，不是密钥，只能用于归属上报，不能读取统计数据。真正的凭据是 `CLOUDFLARE_API_TOKEN`，只放在 CI Secrets 里，不进仓库。
- **zone 侧只对本域名关闭自动注入。** `zenty.top` 的 zone 仍开着 Web Analytics 自动注入（注入 beacon 的 token 是 `e55d7aadd2c145feb23c9a9e6369418c`，其它主机名照旧由它上报）；一个页面只应加载一个 beacon 实例，重复加载会重复计数。实际生效的做法是在 `zenty.top` → Rules → Configuration Rules 下加一条配置规则，只匹配本站主机名：

  | 项 | 值 |
  | --- | --- |
  | ref | `aiguide_dedicated_web_analytics` |
  | phase / ruleset | `http_config_settings` / `44e83d582ac94c0abdebd43d40236e7c` |
  | rule id | `5ac2a7f52b2342cd9665e394a789a5b8` |
  | 表达式 | `http.host eq "aiguide.zenty.top"`（exact） |
  | 动作 | `set_config`，`disable_rum: true` |

  它只对 `aiguide.zenty.top` 关掉 zone 级自动注入，页面自己加载独立条目的 beacon 上报到 `cloudflareinsights.com`；zone 里原有的 RUM 通配规则没有改动。**注意**：在 Web Analytics 里「再加一条规则」的路径试过但失败（HTTP 409 `maxRulesError`），部署的不是那条路径；配置规则与统计条目都在 Cloudflare 控制台维护，不在仓库里。
- **回滚要成对操作。** 要回到纯自动注入，必须同时做两件事：删掉上面这条 `disable_rum` 配置规则，并从 `BaseLayout.astro` 移除手动 beacon 后重新部署。只做一半会漏统计或双重计数。**不要**关掉 `zenty.top` 的整站 RUM——那会让其它主机名一起失去统计。
- **历史数据留在旧条目。** 换成独立条目之前的访问量仍在原来 `zenty.top` 的条目里；新条目只统计切换之后的流量，两边曲线不能相加或直接对比。
- **Workers 指标不是访客统计。** 这个 Worker 只托管静态资源、不执行 Worker 代码，所以 Workers 的调用次数与日志并不对应网站访客；访客数、页面浏览量与页面性能以 Web Analytics 条目为准，不要把 Workers 指标当成访问统计。
- **查询字符串。** 搜索匹配在浏览器本地完成；刷新或分享带 `?q=` 的搜索地址时，关键词会随页面请求发送到托管服务。Cloudflare 文档说明 Web Analytics 不记录查询字符串。
- **隐私边界。** beacon 收集聚合的访问量与页面性能数据（同时带上页面 URL 与 referrer），不写 Cookie、localStorage 或 IndexedDB，不做跨站追踪、用户画像或 IP 指纹。改完加载逻辑后在正式域名打开一次页面，确认 Network 里 `beacon.min.js` 只有一个实例；beacon 正常会把加载（load）与性能（performance）分成两条请求上报，出现两条属于预期。

## 验证记录

最近一次验证的命令与结果、截图位置、遗留风险见 [`docs/verification.md`](docs/verification.md)。

## 说明

站点文字与图形为原创，没有虚构的作者身份、用户评价或统计数据。教程中的命令示例请在本地空仓库先行验证；涉及删除、发布、权限变更的操作，先确认影响范围再执行。
