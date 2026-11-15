# 内容扩充集成记录（12 → 36）

日期：2026-11-14

本文记录教程从 12 篇扩充到 36 篇时，集成侧对导航、路线、测试与文档的调整。新教程正文由内容编写方负责；本记录只覆盖集成改动，不代表 36 篇已经全部发布。

## 契约

- 教程总数 36 篇，六个主题分类不变：Codex、Claude Code、Agent、MCP、Skills、自动化。
- 学习路线固定六条，路由编号 `ROUTE 01` 至 `ROUTE 06`；每条路线的步骤 ID 与文章 ID 一一对应，全部 36 篇在路线中出现且只出现一次。
- 文章 URL 保持 `/articles/<id>/`；原有 12 篇的 ID、slug、正文与结构不动，仅调整 `order`。
- 新文章的分类与 `order` 由内容编写方维护；集成侧不覆盖。
- Windows 环境是 Codex 路线的可选分支，不宣称每一步都是严格前置依赖。

## 集成改动

| 文件 | 改动 |
| --- | --- |
| `src/data/paths.ts` | 从三条路线改为六条，覆盖全部 36 个 ID；步骤标签按阅读目标重写，Windows 标注为可选环境分支。 |
| `src/data/categories.ts` | 六个分类的简介、前置条件与学习重点对齐新序列；安装类内容不再要求预先装好工具。 |
| `src/lib/articles.ts` | `prevNext` 限定在当前文章所属分类内，仍按集合的 `order` 排序，避免 Codex 的下一篇跳到 Claude Code。 |
| `src/pages/index.astro` | 首屏 CTA 优先指向 `codex-install-login`；路线区显示动态条数与动态总数，每条路线只预览前 3 步并链接到完整路线。 |
| `src/pages/paths/index.astro` | 六条路线全部展开；移除“每一步都依赖前一步”的绝对表述，改为先选环境再按相关步骤推进。 |
| `src/pages/articles/index.astro` | 空状态去掉“三条路线”的硬编码。 |
| `src/pages/about.astro` | 站点说明改为不依赖具体路线数量的表述。 |
| `src/pages/changelog.astro` | 新增 2026-11-14 的“教程扩充：六个主题路线”条目，写给读者看；历史条目保持不变。 |
| `src/content/articles/automation-checkpoints.md` | 仅替换结尾“12 篇内容”的过时句子，改为不依赖总数的表述。 |
| 原有 12 篇 frontmatter | 只改 `order` 为新序列对应的整数值，其余字段、正文与 slug 不变。 |
| `tests/smoke.mjs` | 文章 ID 改为直接读取 `src/content/articles/*.md`，断言至少 36 篇；校验搜索索引、RSS、sitemap、路线页对全部文章的唯一覆盖；六个路线锚点从页面读取而非写死 `01..03`；`dateModified` 与 sitemap `lastmod` 对照源码 frontmatter 日期。 |
| `tests/e2e.mjs` | 新增 `Windows` → `codex-windows-setup`、`幂等` → `automation-idempotency` 两条搜索断言；移动端溢出检查加入新教程页面。 |
| `README.md` | 路线说明改为六条，补充路线与文章同步、同主题上一篇/下一篇的维护说明；部署与 SEO 日期约定保持不变。 |

## 验证状态

以下验证**尚未运行**，等 24 篇新文章到齐后由主流程统一执行：

- `npm run check`
- `npm run build`
- `npm run test:smoke`
- `npm run test:e2e`（需要本机浏览器）

在源码不足 36 篇或构建未通过前，不应对外声称 36 篇已经发布。

## 已知边界

- 冒烟测试从源码目录推导文章集合，但只检查构建产物；新文章缺文件、构建失败或搜索索引生成异常时仍会失败，测试没有被放宽。
- `dateModified` 对照只解析 frontmatter 的 `updatedAt`（缺省时用 `publishedAt`），格式假设为 `YYYY-MM-DD`；若将来引入时间戳或时区，需要同步调整测试。
- 首页只预览每条路线的前 3 步，完整顺序在学习路线页；首页文章链接数量必须小于文章总数，防止退化成 36 条全量列表。
- 移动端检查覆盖 390px 与 320px；最长的安装/Windows 教程页面已加入检查，但最终结论以主流程实际浏览器运行为准。
- `relatedArticles` 的评分逻辑未改；如后续发现跨主题推荐质量下降，再单独评估。
