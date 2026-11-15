# Zenty AI Guide 视觉重做验证报告

日期：2026-11-14
环境：Windows + Node v24.11.0、Astro 7.4.12、Tailwind 4.3.5、Chrome（playwright-core `channel: chrome`，headless）
仓库：无 Git（本地目录），因此以下以文件与日志为证据，不使用提交号。

## 1. 结论

- **功能与构建全绿**（最终一轮 20:35）：`npm run check` 0 error / 0 warning / 2 hint，`npm run build` 26 页完成，`npm test` smoke 2104 + e2e 68 全过，`docs/tutorial-regressions.mjs` PASS。
- **性能全绿**：技能 `perf.mjs` 在 1440 与 390 两个视口 23 项全 PASS（0 FAIL / 0 WARN），总传输 71.4 KiB，无图片、无 WebGL、CLS 0。
- **视觉 gate 未 PASS，且已无法再跑**：轨迹为 `GATE: FAIL 15 (round 1 of 3)` → 修复后 `GATE: FAIL 15 (round 2 of 3)`、8 WARN → 再调整后 `GATE: OPEN 16 (rounds used up)`、5 WARN → 最后 `GATE: OFF (no build active)`（3 轮用尽，脚本拒绝继续评估）。三份日志在 `.work/gate-run.log`、`.work/gate-round2.log`、`.work/gate-round2b.log`、`.work/gate-round3.log`；`.taste-skill/gate.json` 是最后一轮快照（open 16 / waived 5 / warn 5）。
- 最后一次快照里的第 16 条 `split-pair` 是「把全部教程入口抬到 44px 点击区」时引入的列顶错位，已用对称负 `margin` 修掉，并用自建脚本实测：`.hero-lower` 两列 top 均为 250px（差 0），无法再用 gate 复核，故按「已修、仅自测」记录。其余 15 条的构成与上一轮一致：与「简洁、自然高度、不要装饰视觉」约束冲突、与现有 Astro 语义结构（`header`/`footer`/`.shell`）冲突、或检查器对页脚 logo lockup 与换行内联行的测量误报。
- 本轮同时完成了 Codex 评审提出的 6 项实质问题与 P3 命中区（见 §12），未改动版式与配色方向；waiver 仍为 5 条上限，未新增。

## 2. 真实命令结果

| 命令 | 时间 | 结果 | 日志 |
| --- | --- | --- | --- |
| `npm run check` | 20:35 | `Result (39 files): 0 errors / 0 warnings / 2 hints`，exit 0 | `.work/final4-check.log` |
| `npm run build` | 20:35 | `26 page(s) built in 2.07s` + `Complete!`，`sitemap-index.xml` 生成，exit 0 | `.work/final4-build.log` |
| `npm test` | 20:35 | `2104/2104 checks passed`（smoke）、`74/74 browser checks passed`（e2e），忽略 2 条故意错误，exit 0 | `.work/final4-test.log` |
| `docs/tutorial-regressions.mjs` | 20:21 | `== PASS · 10.3s ==`（教程正文抽出的 4 组代码仍可运行） | `.work/final3-regressions.log` |
| `perf.mjs` | 19:25 | `SUMMARY: 0 FAIL, 0 WARN -> PASS`（1440 / 390） | `.work/perf-final.json` |
| `gate.mjs` | 19:09 | `GATE: FAIL 15 (round 1 of 3)` | `.work/gate-run.log`、`.taste-skill/gate.json` |

同一套源码在 18:44 / 18:46 与 19:28 / 19:29 各跑过一轮，结果一致（`.work/final-check.log`、`.work/final-build.log`、`.work/final-test.log`、`.work/final2-*.log`）；20:21 那轮是第一次评审修复（§12）后的复跑（e2e 68），20:35 那轮是第二轮定点修复（§13）后的最终复跑（e2e 74）。

两个 hint 是既有代码的提示，与大改无关：`docs/tutorial-regressions.mjs:29` 的 `WORK_POSIX` 未使用、`src/scripts/site.ts:121` 的 `document.execCommand` 弃用。e2e 忽略的 2 条是测试自身标注的故意错误（404 导航、主动中断的索引请求）。

一致性说明：18:39 的字体/对比度实测、19:09 的 gate 与 19:21 的截图对应的是 18:37 那一版 `src/styles/global.css`。20:12–20:18 的第一轮评审修复、20:32–20:35 的第二轮定点修复又改了 `src/styles/global.css`、`src/scripts/site.ts`、`src/pages/index.astro` 与 `tests/e2e.mjs`，因此**截图与 perf 数据早于最终源码**：视觉方向未变（只动了命中区高度、按钮描边、页脚焦点环与文字颜色），但没有重新截图，原因是桌面截图会抢占前台窗口，已被明确叫停（§10）。

## 3. GATE 行与计数口径

```
GATE: FAIL 15 (round 1 of 3)   -- 18:37 版源码，.work/gate-run.log
GATE: FAIL 15 (round 2 of 3)   -- 评审修复后，8 WARN，.work/gate-round2.log
GATE: OPEN 16 (rounds used up) -- 命中区调整后，5 WARN，.work/gate-round2b.log
GATE: OFF (no build active)    -- 3 轮用尽后的再次调用，.work/gate-round3.log
```

命令：

```
node C:/Users/zhangziheng/.agents/skills/design-taste-frontend/scripts/gate.mjs
```

`gate.json`（最后快照）：`open: 16`、`waived: 5`、`warnCount: 5`、`found.fails: 21`、`crashed: 0`、`at: 2026-11-14T12:13:03Z`。检查器自身的 kit 文件（`C:/Users/zhangziheng/.agents/skills/design-taste-frontend/`）未被读取以外的任何方式改动；waiver 只有 `.taste-skill/waivers.json` 这一处，5 条，未超过上限，全部是本方案的取舍与技能的通用营销页要求之间的冲突（hero 高度、topics 高度、hero 不配装饰视觉、不设 moment、中文标题不在检查器词表内），没有一条来自用户的逐字要求，也没有一条用来掩盖结构性或可修的缺陷；归属口径见 `docs/redesign-plan.md` §1。

各轮 FAIL 数量的变化是真实的：`tap-size` 3 条从 FAIL 降为无（命中区扩到 44px），`button-contrast` 1 条从 WARN 消失（给 tonal 按钮加 34% 强调色描边），但同时 `split-pair` 因为 `.recent-head` 的高度变化新增 1 条，最终净增 1，故 16。`split-pair` 随后修复，但轮次已用尽。

## 4. 已登记 waiver（5 / 上限 5）

| check | target | 理由 |
| --- | --- | --- |
| `hero-screen` | `main#main > section.hero` | 派发说明要求自然内容高度、不为一屏一区块强塞空白；本方案据此不做强制满屏营销 hero——hero 在 680px 结束，紧接着就是路线 |
| `section-height` | `main#main > section.section.topics` | 主题带是紧凑的可导航索引，不是满屏营销区块；派发说明不鼓励填充式空白，本方案按此取舍 |
| `no-visual` | `main#main > section.hero` | 教程知识库以真实阅读列表开场；派发说明点名不要照片、伪终端、伪仪表盘、shader 与装饰视觉，本方案据此不配装饰视觉（属方案取舍，非用户逐字要求） |
| `moment-none` | `(the page)` | 派发说明不鼓励动效场景，本方案据此不设 dealt moment，只保留一次安静的 hero 入场 |
| `copy-headline` | `h1.display` | h1 就是要求的「AI 编程与 Agent 开发指南」，检查器的英文类目词表覆盖不到中文语义 |

waiver 文件中的英文理由正文按检查器要求写成英文，并明确标注为「实施方案决策」；用户逐字原话只有「现在的页面一股ai味，不高级简洁明了，你用design-taste-frontend再优化一遍」。归属口径见 `docs/redesign-plan.md` §1 的说明。

## 5. 未消解的 FAIL（最后快照 16 条，其中 §5.5 的 `split-pair` 已修）

### 5.1 与「自然高度 / 不要长空白」约束冲突（5）

| # | check | target | 检查器意见 |
| --- | --- | --- | --- |
| 1 | `hero-fill` | `section.section:nth-of-type(2)`「三条路线，按顺序读」 | 下一节从 735px 起就露出（hero 在 666px 结束） |
| 2 | `hero-screen` | 同上 | hero 下方 234px 已在首屏可见（SR-1） |
| 3 | `section-height` | `footer.site-footer` | 页脚 343px，距满屏差 557px（SR-2） |
| 4 | `one-section` | `footer.site-footer` | 滚动到第 3 节顶部时同时看到页脚内容（SR-4） |
| 5 | `one-section` | `h2#routes-title` | 第 1 节顶部时第 2 节标题与内容同屏（SR-4） |

不修理由：这 5 条要求每一节都接近一整屏。要满足它们只能加入大量空白或把内容抻开，与任务说明里「不要为一屏一区块强塞长空白」以及用户「简洁明了」的诉求直接矛盾。

### 5.2 与「不要装饰视觉 / 不要营销收尾」冲突（4）

| # | check | target | 检查器意见 |
| --- | --- | --- | --- |
| 6 | `no-visual` | `section.section:nth-of-type(2)` 路线 | 该 section 没有图片、效果或 mock |
| 7 | `no-visual` | `section.section.topics` 主题 | 同上 |
| 8 | `text-only` | `section.section.topics` | 收尾区块只有文字 |
| 9 | `cta` | `section.section.topics` | 页脚前最后一节没有按钮 |

不修理由：教程站的内容证据是真实教程、真实分类与计数，不是配图或伪 UI；主题索引本身就是可点的入口。加插图、伪终端或营销 CTA 与本方案「以真实教程为证据、不加装饰视觉」的取舍相冲突（派发说明中明确不要伪终端、伪仪表盘与照片）。

### 5.3 与现有 Astro 语义结构冲突（4）

| # | check | target | 检查器意见 |
| --- | --- | --- | --- |
| 10 | `container-edges` | `a.skip-link` | 期望在 `header.nav`、`main`、`footer.closing`、`nav.actionbar` 之内（SR-6） |
| 11 | `container-edges` | `header.site-header` | 期望 `header.nav` |
| 12 | `container-edges` | `footer.site-footer` | 期望 `footer.closing`，同时列出 `div#copy-status` 等 5 个元素 |
| 13 | `container` | 整页 | 页面没有使用 kit 的 `.wrap` 容器 |

不修理由：站点用语义化 `header`/`footer` + `.shell` 容器，这是现有 Astro 布局与全部页面共用的约定；改成 kit 的类名属于跨全站重构，超出本轮收尾范围，且没有视觉收益。实测各视口容器左右边距一致（见第 7 节）。

### 5.4 检查器测量误报（2）

| # | check | target | 检查器意见 | 判断 |
| --- | --- | --- | --- | --- |
| 14 | `off-grid` | `span.brand-name`「Zenty」 | 文字左边 102px，距页边 80px 差 22px | 页脚 lockup 的视觉左缘是 22px 宽的四点 logo mark，它精确对齐 80px 页边；文字在其右属设计意图 |
| 15 | `off-grid` | `p.hero-facts > span:nth-of-type(2)` | 左边 127px，与所在 section 的公共边 111px 差 16px | 该行是小屏换行后的内联条目（`·` 分隔），元素左缘本就不构成对齐边 |

两条都在 `.taste-skill/gate/consistency/1440-10-off-grid.jpg`、`390-02-off-grid.jpg` 中人工核对过；因 waiver 上限已满，未再登记，按「检查器测量口径不适用于行内元素/logo lockup」记录在此。

### 5.5 `split-pair`（本轮引入并已修，仅自测）

| check | target | 检查器意见 | 现状 |
| --- | --- | --- | --- |
| `split-pair` | `div.hero-lower` | 分栏两列的顶部相差 13px | 已修：`「全部教程 →」` 的 44px 命中区改用对称负 `margin`（`-0.625rem`），行高不变。自测 `.hero-lower` 两列 top 均为 250px、`.recent-head > a` 为 64×44，见 `.work/measure.mjs` 输出；gate 轮次用尽，无法复核 |

口径：这一条**不**计入 15 条稳定 FAIL，也不声称 gate 因此变成 15。可复核的证据只有自测数字，报告时按「gate 最后快照 16，其中 1 条已修待复核」表述。

## 6. WARN（最后快照 5，检查器标注 not blocking）

| # | check | 内容 | 处理 |
| --- | --- | --- | --- |
| 1 | `copy-actions` | 主行动文案在导航 / hero / 收尾未逐字一致 | 教程站没有收尾 CTA，属结构取舍，不改 |
| 2 | `nav-family` | 导航字号 15 与 17px 两档（17px 是 768px 以下展开面板里的条目） | 有意保留：栏内链接统一 15px，触屏面板条目用 17px 更好点 |
| 3 | `link-styles` | 文字链接 3 种样式（下划线 / 无 / 加粗标题） | 有意区分正文链接、导航式文本、列表标题 |
| 4 | `skip-link` | 第一个 Tab 停靠点是 `跳到正文` | 这是站点真正的 skip link，检查器按自己模板识别不到 |
| 5 | `heading-scale` | 390 宽下 h3 22px 仅为 h2 28px 的 1.27 倍（阈值 1.3） | 差 1px 级别，冻结不改 |

本轮的改动让 4 条 WARN 消失，均可在 `.work/gate-round2.log`（9 → 8）与 `.work/gate-round2b.log`（8 → 5）对比：

- `tap-size` 3 条：路线标题、教程标题、页脚链接、目录项、`全部教程 →` 全部抬到 44px 命中区（实测尺寸见 §12.3）。
- `button-contrast` 1 条：`.btn--tonal` 加 34% 强调色描边后按钮边界可辨。

注意：WARN 只在最后一轮快照有效；`.recent-head` 的二次修改之后 gate 已无法再跑，因此这 5 条是「最后一轮」而不是「最终源码」的读数，结论不受影响（改动只涉及命中区高度与描边）。

## 7. 视觉验证

截图脚本：`.work/shoot-pages.mjs`（playwright-core + 本机 Chrome，`deviceScaleFactor: 1`，等待 `networkidle` 与 `document.fonts.ready`）。

**截图源**：`npx astro preview --port 4322` 服务 `dist/` 生产构建（非 dev server）。尝试中发现 `.work/redesign-after/` 早期截图里出现的“深色浮动胶囊”实为 `astro-dev-toolbar`（dev-only 元素）；DOM 探针确认页面仅 `a.skip-link`、`header.site-header`、`div.mobile-nav` 三个 fixed 元素，对 (750, 890) 取点得到 `ASTRO-DEV-TOOLBAR`，改用 preview 后消失。当前 21 张 after 截图全部来自生产构建。

- 改前：`.work/redesign-before/`（21 张，`before-*`）
- 改后：`.work/redesign-after/`（21 张，19:21 生成）
- 视口与页面：1440（首页/首页首屏/深色/文章/文章深色/教程列表/路线/分类/搜索/关于/404）、1024（首页）、768（首页）、390（首页/深色/文章/教程列表/路线/搜索/更新）、320（首页）

| 视口 | 首页全高 | 横向溢出 |
| --- | --- | --- |
| 1440 | 2712px（旧版约 3592px） | 0 |
| 1024 | 2798px | 0 |
| 768 | 3431px | 0 |
| 390 | 4351px | 0 |
| 320 | 4566px | 0 |

`document.documentElement.scrollWidth - window.innerWidth` 在 21 次截图中全部为 0，无横向滚动。

人工查看的图与结论：

- `home-1440-fold.png`、`home-1440.png`：暖近白纸面、单一松绿强调、hero 左陈述右侧真实教程列表，第一屏即可点到第一篇教程；四条路线以 01–04 步骤行呈现，无卡片套壳。
- `home-dark-1440.png`：深色不是简单反相，层级与浅色一致，发丝线、页脚、强调色都可读。
- 390 / 320 首页与局部裁切（`.work/m-fold.png`、`.work/m-routes.png`、`.work/f-320.png`）：320 下 header 自动隐去「AI 指南」副标，搜索、主题、菜单均完整可见；标题换行合理；无截断、无挤压。
- `article-1440.png` 与 `.work/a-top.png`：面包屑、kicker（`MCP · 进阶 · 约 6 分钟`）、大标题、摘要、元信息与标签、右侧 sticky 目录与「本篇属于」路线 rail 齐全。
- `articles-390.png`、`paths-1440.png`、`search-1440.png`、`categories-1440.png`、`about-1440.png`、`changelog-390.png`、`404-1440.png`：均为页头 + 发丝行列表结构，无重复三列卡矩阵。

## 8. 计算字体与对比度实测

`.work/audit.txt`（浏览器计算样式，18:39）：

- `body`：`17px / 31.45px / 400`，`font-family` 为 `"Host Grotesk", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif`。中文全部落到 sans 栈，没有衬线回退，因此不存在“部分文字像宋体”的情况。
- `.display`（h1）：`60px / 66px / 600`；`.path-steps li a`：`17px / 31.45px`。
- 对比度：浅色首页最低 5.01:1（`p.section-intro`），深色首页最低 6.95:1，`failures: []`。
- 已知偏差：`.path-summary` 为 `15px / 27px`，低于技能对灰卡正文 16px 的建议，属第 6 节之外的已知小偏差，本轮冻结不改。

## 9. 功能保留与回归

保留并有测试覆盖：站内搜索（防抖、请求中止、失败重试、URL 参数、`/` 快捷键）、主题切换与 `localStorage` 持久化（含首屏内联脚本防闪烁）、移动导航（含背景 `inert`、Tab 焦点环、关闭后焦点回到开关）、文章目录（桌面与移动两份同步高亮）、阅读进度、代码复制状态、相关教程、prev/next、RSS、sitemap、metadata 与 OG。

`tests/smoke.mjs`、`tests/e2e.mjs` 只适配了新的语义选择器（首页 `.path-list`、e2e 的 `.path-list a`、目录 `.toc-wrap a`），断言数量未减：smoke 2104、e2e 74（新增 6 + 6 条：第二轮新增跨断点焦点、页脚焦点环对比度、移动目录行高与复制按钮高度；第一轮新增移动导航打开时 `main` 为 `inert`、Tab 循环停留在面板内、Escape 关闭后焦点回到开关、关闭后 `inert` 解除、桌面点目录后同 ID 的两份目录链接同时带 `aria-current`、390 宽代码复制按钮底边不高于 `pre` 顶边）。

## 10. 剩余限制

- **gate 未 PASS，且本轮未重跑**：最后快照 16 条开放 FAIL + 5 条 WARN，如实保留；waiver 已到 5 条上限，无法再吸收 §5.4 的两条测量误报；gate 的三轮额度已用尽（再次调用返回 `GATE: OFF (no build active)`），`split-pair` 的修复只有自测证据。
- **教程配图未完成（外部叫停）**：原计划为 codex-first-task、claude-code-workflow、mcp-first-server、skills-design 四篇补真实截图，已搭好可用的 Windows Terminal 截图链路并实拍成功一张，但被明确要求停止一切窗口激活与截图，随后中止；按指示**未用 HTML 伪界面、生成图片或终端文字复刻替代**。因此这四篇仍无插图，`public/images/tutorials/` 不存在。
- **截图与 perf 早于最终源码**：`.work/redesign-after/` 21 张来自 19:21 的生产构建；20:12 之后的修复只改命中区、按钮描边与页脚强调色，未重拍。
- 未验证的浏览器与设备：仅 Windows Chrome（headless）1440/1024/768/390/320，未覆盖 Safari、Firefox 与真机。
- 深色主题只截了首页（1440/390）与文章（1440），未逐页截深色。
- 320 只核对了首页首屏与列表头部。
- 性能数据是 `perf.mjs` 的 CPU 渲染相对值，不能与线上字段数据比较。
- 未部署、未创建外部仓库、未修改教程正文、content schema、路由 ID、SEO 域名与教程回归脚本。
- 本轮未新增或删除运行时依赖；字体为自托管 woff2（`public/fonts/`）。

## 11. 改动文件

配置文件：`.gitignore`、`astro.config.mjs`

布局与组件：`src/layouts/BaseLayout.astro`、`src/components/{Header,Footer,ArticleRow,Breadcrumbs,TableOfContents}.astro`

页面：`src/pages/{index,about,changelog,search,404}.astro`、`src/pages/articles/{index,[id]}.astro`、`src/pages/categories/{index,[category]}.astro`、`src/pages/paths/index.astro`

样式与脚本：`src/styles/global.css`、`src/scripts/{search,site}.ts`

资源：`public/favicon.svg`、`public/og-default.png`、`public/fonts/{host-grotesk-latin,jetbrains-mono-latin}.woff2`、`public/fonts/README.md`、`public/fonts/licenses/{host-grotesk-OFL,jetbrains-mono-OFL}.txt`

测试与文档：`tests/{smoke,e2e}.mjs`、`docs/redesign-plan.md`、`docs/redesign-verification.md`（本文件）、`.taste-skill/waivers.json`

## 12. 独立评审修复记录

来源：Codex CLI（GPT-6 Astra, high）只读评审，结论无 P0/P1，列出 6 项实质问题与 P3 命中区；本轮逐条修复并补了回归。

### 12.1 六项实质问题

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| 1 | `src/scripts/site.ts`（`initMobileNav`） | 面板打开后 Tab 会越过末项进入被遮挡的正文 | `main`/`footer` 在打开时 `inert = true`；`keydown` 内做 Tab 循环（Shift+Tab 从首项绕到末项，末项 Tab 绕回首项）；Escape 先 `preventDefault` 再关闭；关闭时焦点回到开关；`matchMedia('(min-width: 768px)')` 变化时，若焦点原本在面板内则归还焦点 |
| 2 | `src/scripts/site.ts`（`initToc`） | `targets.find` 只更新 DOM 中先出现的移动目录，桌面副本抢走高亮 | 改为按 heading 元素分组 `Map<HTMLElement, HTMLAnchorElement[]>`，一次标记同 ID 的全部链接；观察器与点击都按分组处理 |
| 3 | `src/pages/index.astro` | 集合为空时 `firstArticle.id` 读取 `undefined` 致构建失败 | `?? articles[0] ?? null`，hero 按钮条件渲染，空集合降级为「浏览全部教程」 |
| 4 | `src/styles/global.css`（`.copy-btn`）、`src/scripts/site.ts`（`initCodeCopy`） | 绝对定位的复制按钮压住代码首行 | 改为代码块顶部工具栏：`wrapper.append(button, pre)` + 静态定位 `margin: 0 0 0.4rem auto`，不再覆盖文本 |
| 5 | `src/styles/global.css`（页脚链接） | 浅色主题下深色页脚沿用深绿 hover，约 2.33:1 | 新增 `--footer-accent`（浅色 `#b9dcc9`、深色 `#bfe3d3`），页脚链接与 RSS 的 `:hover`/`:focus-visible` 改用它；`.footer-legal a` 补 `focus-visible` |
| 6 | `.taste-skill/waivers.json`、本文件 | 把实施方案取舍写成“用户明确要求”，§9 曾称小目标另有整行点击区 | waiver 5 条理由改为 `Implementation decision…`；本文件归属措辞按“仅用户原话为「现在的页面一股ai味，不高级简洁明了，你用design-taste-frontend再优化一遍」”改写；§9 删除与源码不符的整行点击区描述 |

### 12.2 字体文件与许可（以实测元数据为准）

用 `D:/Anaconda/python.exe`（`fontTools` 4.51.0）读取 `name` 表并计算 SHA-256，2026-11-14：

| 文件 | 字节 | SHA-256 | 内部族名 / 版本 | 字形数 |
| --- | --- | --- | --- | --- |
| `public/fonts/host-grotesk-latin.woff2` | 20296 | `ce9c9db8a488852eb7e4a52f51fd8ce0c93ef61a8d3bfa054b509ec92958dcfe` | `Host Grotesk Light` / `Version 1.003` | 247 |
| `public/fonts/jetbrains-mono-latin.woff2` | 31432 | `83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be` | `JetBrains Mono` / `Version 2.211` | 394 |

两个文件都是 `wOF2` + TrueType 轮廓 + `fvar`/`gvar`/`HVAR`；内部版权行分别为 `Copyright 2023 The Host Grotesk Project Authors (https://github.com/Element-Type/HostGrotesk)` 与 `Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)`，与 `public/fonts/licenses/` 下随附的两份 OFL 全文中的版权行一致（许可全文取自 `google/fonts` 的 `ofl/<family>/OFL.txt`，各 93 行，未改写）。完整说明见 `public/fonts/README.md`。

据此**删除**了此处原先的两处错误结论：一说「本机没有 fontTools、无法读内部 name 表」（实际可读，且已读），二说「woff2 由本地子集化产生、未改字形、符合 OFL 要求」（没有生成记录，无法证明）。现在的口径是：文件是合法 woff2、内部族名/版本/版权行与上游一致、许可全文随附；**生成路径未保留记录、无法确认**，因此不声称来自官方 URL 直下，也不声称未修改字形，更不把「未改族名」当作 OFL 合规结论。

### 12.3 命中区与实测（headless Chrome，`deviceScaleFactor: 1`）

| 目标 | 选择器 | 尺寸 |
| --- | --- | --- |
| 最近教程「全部教程 →」 | `.recent-head > a` | 64×44 |
| 路线标题 | `.path-main h3 a` | 229×50 |
| 路线步骤行 | `.path-steps a` | 647×62 |
| 页脚栏链接（1440 / 390） | `.footer-col a` | 56×44 |
| 页脚 RSS | `.footer-rss` | 78×44 |
| 跳过链接 | `.skip-link` | 102×49 |
| 文章目录项（桌面） | `.toc-wrap a` | 240×51 |
| 主按钮 | `.hero-actions .btn` | 201×48 |

同一次测量：`.hero-lower` 两列 top 均为 250px（差 0，`split-pair` 的修复证据）；文章页复制按钮底边 1351px、`pre` 顶边 1357px，不重叠。
## 13. 第二轮只读复审的 5 项修复

来源：Codex 第二轮只读复审（3 项 P2 + 2 项 P3）。全部为定点最小修改，未改版式与配色方向，未重跑已用尽轮次的 gate。

| # | 级别 | 位置 | 问题 | 修复 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | P2 | `src/scripts/site.ts` `initMobileNav` | 菜单打开时跨 768px 断点，`setOpen(false, true)` 仍对 `display:none` 的 toggle 调 `focus()`，焦点落在不可见元素上 | 新增 `focusLanding()`：toggle 可见时还给 toggle（Escape 路径不变），否则取 `.header-bar` 内第一个可见的 `a[href]`/`button`（实际是品牌链接），取不到才退回 toggle | 真机测量：面板内焦点在 390 宽 → 拉到 1024 宽后 `activeElement` 是品牌链接 `Zenty AI 指南`，`offsetParent !== null`、不在面板内、不是 toggle、`panel.hidden` 为真、`main.inert` 为假；对应 e2e 新增 3 条断言 |
| 2 | P2 | `src/styles/global.css` `.site-footer` | 只改了页脚文字色，`:focus-visible` 的 `outline` 仍用页面级 `--focus` 深绿，在深色页脚上几乎看不见 | `.site-footer { --focus: var(--footer-accent); }`（浅色 `#b9dcc9`、深色 `#bfe3d3`），焦点环随页脚主题走 | 计算样式：`--focus: #b9dcc9`、`outline: 2px solid rgb(185, 220, 201)`，与页脚底色 `rgb(23, 22, 18)` 的对比度 12.19:1；e2e 断言 outline 宽度 ≥ 2 且对比度 ≥ 3 |
| 3 | P2 | `docs/redesign-verification.md`、`docs/redesign-plan.md` | §3 仍称 5 条 waiver 全是「用户约束」，与 waiver 文件里的 `Implementation decision` 自相矛盾；多处把「不要照片/动效」写成用户逐字禁止 | §3 改为「本方案取舍 vs 技能通用营销页要求」，明确没有一条来自用户逐字要求；§5.1/5.2 与 plan 的偏离表把来源改写为「派发说明（协调者）」+「本方案据此取舍」，用户逐字原话只保留「现在的页面一股ai味，不高级简洁明了，你用design-taste-frontend再优化一遍」 | 全文检索 `任务说明禁止` / `用户明确要求` 仅剩 §12 的历史修订记录一处 |
| 4 | P3 | `src/styles/global.css` `.toc a`、`.copy-btn` | 移动目录单行 36px、复制按钮此前也缩到 36px，低于 44px 触屏下限 | 两者统一 `min-height: 2.75rem` | 390 宽实测：`.toc-mobile a` 8 项高度全为 44px；`.copy-btn` 50×44、底边 1884px < `pre` 顶边 1891px；e2e 各加 1 条断言 |
| 5 | P3 | `public/fonts/README.md`、本文件 §12.2 | 原文声称「本机没有 fontTools、无法读 name 表」「woff2 由本地子集化产生、未改字形、符合 OFL」，后者没有证据 | 用 `D:/Anaconda/python.exe`（fontTools 4.51.0）实读 `name` 表并算 SHA-256，写入版本、版权行、字形数与摘要；删除「本地子集化产生」「未改字形」「合规结论」三处无证据表述，来源统一标为「未保留记录，无法确认」 | Host Grotesk Light `Version 1.003`／247 字形／`ce9c9db8…dcfe`；JetBrains Mono `Version 2.211`／394 字形／`83c005d4…a5be`；两份内部版权行与随附 OFL 一致 |

### 13.1 本轮最终命令结果（20:35）

- `npm run check`：`Result (39 files): 0 errors / 0 warnings / 2 hints`（`.work/final4-check.log`）
- `npm run build`：`26 page(s) built in 2.07s` + `Complete!`（`.work/final4-build.log`）
- `npm test`：smoke `2104/2104`、e2e `74/74`，忽略 2 条故意错误（`.work/final4-test.log`）
- 定点复测脚本：`.work/verify2.mjs`（页脚焦点环对比度、390 宽目录/复制尺寸、跨断点焦点落点）

### 13.2 gate 状态（未变）

gate 三轮额度在上一轮已用尽，本轮**没有重跑**，也没有新增 waiver。真实状态仍是最后快照 `open: 16 / waived: 5 / warnCount: 5`，最后一次调用返回 `GATE: OFF (no build active)`；`split-pair` 仍只有自测证据（本轮改动不涉及 `.hero-lower`、`.recent-head` 与 `.toc`/`.copy-btn` 的布局关系之外的项，`.toc a` 高度变化不影响首页分栏）。

### 13.3 仍未完成

四篇教程的真实截图仍缺（`codex-first-task`、`claude-code-workflow`、`mcp-first-server`、`skills-design`）。第二轮同样在「禁止可见窗口与前台截图」的约束下进行，只用了 headless Chrome 做几何与计算样式测量，没有新增任何截图；`public/images/tutorials/` 仍不存在。
