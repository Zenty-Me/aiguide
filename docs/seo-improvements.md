# SEO 修订记录（2026-11-14）

本次只改站内实现与内容，未部署、未提交搜索引擎，也没有任何真实抓取、索引或排名数据。以下“验证”均指本地检查结果，不代表线上效果；主流程已完成修复后的最终复验。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/pages/robots.txt.ts` | 删除 `Disallow: /search/`，只保留 `Allow: /` 与 sitemap 声明 |
| `src/layouts/BaseLayout.astro` | `noindex` 页面输出 `noindex, follow`，表示允许继续跟踪链接，不保证权重传递 |
| `astro.config.mjs` | 新增 `captureOutDir` 集成记录实际 `outDir`；sitemap `serialize` 读文章页 `dateModified` 作为 `lastmod` |
| `src/lib/seo.ts` | 新增 `AUTHOR_PATH` / `AUTHOR_ID` / `authorJsonLd`，作者统一指向 `https://aiguide.zenty.top/about/#author`；Article 的 `author` 与 `publisher` 复用同一实体 |
| `src/pages/articles/[id].astro` | `author` 与 `publisher` 复用同一 Person；删除 `wordCount`；正文页显示可点击作者署名 |
| `src/pages/about.astro` | `AboutPage.mainEntity` 指向同一 Person；「维护者」只写已知事实，新增「编辑原则」说明；反馈改为「暂未开放公开入口」 |
| `src/data/categories.ts` | `CategoryInfo` 增加 `prerequisites`、`focus`，六个主题补齐真实学习指引 |
| `src/pages/categories/[category].astro` | 列表上方渲染前置条件、学习重点、前 3 篇按序阅读链接 |
| `src/styles/global.css` | 新增 `.category-guide` 与 `.article-meta a` 样式，沿用现有字号与描边变量 |
| `src/content/articles/*.md`（12 篇） | 重写标题、按需调整描述；`codex-first-task` 增加“卡住时按这个顺序排查”和“接下来读什么” |
| `tests/smoke.mjs` | 新增 robots/noindex、sitemap `lastmod`、作者身份、标题/描述唯一性断言 |
| `README.md` | 新增“SEO 维护”一节 |
| `src/pages/changelog.astro` | 记录本次修订 |

## 关键决策

- **`lastmod` 不解析 frontmatter。** Astro 配置里没有 `getCollection`，也不应再写一遍 Markdown 解析。sitemap 的 `serialize` 在 `astro:build:done` 阶段执行，此时文章 HTML 已生成，直接从 `/articles/<id>/index.html` 读回 Article 的 `dateModified`，与结构化数据天然一致。代价是每次构建多读 12 个小文件，可忽略。
- **`outDir` 用最小集成获取。** 构建输出理论上可配置；冒烟测试固定检查 `dist`，但配置侧不应写死。`astro:config:done` 里记录 `config.outDir` 只增加几行，且必须在 sitemap 集成之前注册。
- **非文章页不输出 `lastmod`。** 这些页面没有可信维护的修改日期；构建时间不等于页面内容变化，输出它只会给出没有依据的日期。缺省字段比错误字段安全。
- **`robots.txt` 与 `noindex` 互补，不能互斥。** 之前 `Disallow: /search/` 会让抓取器根本读不到 noindex，页面可能以“未知”状态长期留在索引里。现在是允许抓取 + `noindex, follow` + 不进 sitemap。
- **作者身份用绝对 `@id`。** `Person` 的 `@id` 与 `url` 都指向 `/about/#author`，关于页 `mainEntity` 引用同一 `@id`。这是说明“同一实体”的一种简单方式；也可以配合 `sameAs` 等外链，但当前没有可公开核验的外部资料。
- **关于页不编造作者信息。** 只写可确认的事实：本站由 Zenty 维护、内容方向与编辑原则；不写作者履历、雇主关系、团队构成或无法核验的流程承诺。反馈入口如实说明尚未开放。
- **分类页指引来自已有教程。** 每条 `focus` 都能在对应文章里找到依据（如 stdio server 不能往 stdout 写日志、`tests 0` 也是绿的），不是泛化的学习建议。
- **标题重写不动 slug 与代码。** 只调整 `title` / `description`，命令、文件名、版本号保持原样；搜索意图靠“动作 + 对象 + 结果”表达，不堆关键词。

## 验证

```
npm run check        # 0 errors / 0 warnings / 2 条既有 hint
npm run build        # 26 页，sitemap 正常生成
npm run test:smoke   # 2301/2301 checks passed
npm run test:e2e     # 74/74 passed
```

主流程在浏览器中检查分类页在 1280 / 390 / 320 三种宽度下的表现，均无横向溢出，截图见 `.work/seo-category-1280.png`、`.work/seo-category-390.png`、`.work/seo-category-320.png`。

评审修复后，主流程重新执行 check、build 与 smoke：0 errors、0 warnings、2 条既有 hints，26 页构建成功，2301/2301 静态检查通过。完整浏览器回归在修复前通过 74/74；修复后对关于页、Codex 入门文章、更新日志在 1280 / 390 / 320 三种宽度下执行 9 项页面与溢出检查，全部通过，并确认文章作者链接跳到 `/about/#author`、修正后的 Git 命令已出现在正文中。

冒烟测试新增的行为断言：

- `robots.txt` 不再包含任何 `Disallow`，仍声明 sitemap；
- `/search/` 与 `/404.html` 的 robots meta 恰为 `noindex, follow`，其余页面为 `index, follow`；
- sitemap 中每个 `/articles/<id>/` 的 `lastmod` 与页面 Article `dateModified` 完全相等，非文章页无 `lastmod`；
- 12 篇文章的 `author.@id`、`author.url` 均为 `https://aiguide.zenty.top/about/#author`，且页面存在 `href="/about/#author"`；
- 关于页 `AboutPage.mainEntity` 指向同一身份，`#author` 锚点存在；
- 所有可索引页面的 title 与 description 互不重复。

## 评审与修复

独立 Codex 评审发现 1 项 P2，无阻塞性回归：

- **P2 — 未跟踪文件的排查指令缺少暂存步骤。** `codex-first-task.md` 的排查项让读者在文件状态为 `??` 时直接看 `git diff --cached`，但该命令只显示已暂存改动，读者照做仍看不到新增测试。修复后明确两条路径：`git add -N src/text.test.js` 后执行 `git diff -- src/text.test.js`，或 `git add src/text.test.js` 后执行 `git diff --cached -- src/text.test.js`。

同轮修复还包括：「接下来读什么」的裸 URL 锚文本改为文章标题；关于页作者段落删除不可核验的说法，只保留已知事实与编辑原则；Article 的 `publisher` 回到与 `author` 相同的 Person；更新日志改为面向读者的描述。

Codex GPT-6 Astra（high）完成第二轮定向只读复审，无未解决发现。评审记录见 `.work/seo-review.md` 与 `.work/seo-review-final.md`。

## 已知限制

- 未部署，未提交 Search Console / Bing Webmaster Tools，未观察真实抓取与排名；上线后需人工核对覆盖率报告与实际查询。
- `lastmod` 精度为日期（frontmatter 是 `YYYY-MM-DD`），同一天多次修订不会体现。
- 当前 12 篇文章的 `updatedAt` 都是 2026-11-14，因此 sitemap 里看到的 `lastmod` 相同；这是数据现状，不是逻辑问题。
