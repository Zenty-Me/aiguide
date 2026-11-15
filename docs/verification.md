# Zenty AI Guide — 实现与验证记录

记录人：Pi 开发 worker（task_c3fdaff06006）
时间：2026-11-14，最后一次完整验证 15:20（本地时间；内容冻结后修复搜索索引断言并全量重跑 check + build + smoke + e2e）
目标站点：<https://aiguide.zenty.top>
范围：除 `src/content/articles/**`、`docs/content-sources.md` 以外的全部实现文件。

## 1. 结论

站点已完成并可在本地完整运行：26 个页面 + 搜索索引 + RSS + sitemap + robots 全部由 `npm run build` 静态产出；`astro check` 0 error / 0 warning；冒烟测试 1940 项、浏览器测试 62 项全部通过。未做发布、未推送、未创建外部仓库；仓库账号、DNS 目标与线上 HTTPS 状态需要所有者按 README 第 6 节实际确认。

## 2. 环境与版本

| 项 | 值 |
| --- | --- |
| 运行环境 | WSL2（bash），项目位于 `/mnt/d/code/aiguide`，浏览器由 Windows 侧执行 |
| Node / npm | v24.11.0 / 11.6.1 |
| astro | 7.4.12（锁定） |
| @astrojs/rss / @astrojs/sitemap | 4.0.19 / 3.7.5 |
| tailwindcss / @tailwindcss/vite | 4.3.5 / 4.3.5 |
| @astrojs/check / typescript | 0.9.12 / 5.9.3 |
| playwright-core | 1.65.1（使用本机 Chrome，不下载浏览器） |
| sharp | 0.35.5（仅用于生成 OG 图） |
| 锁文件 | `package-lock.json` 已提交，`npm ci` 实测通过（383 包，44s） |

## 3. 实际执行的命令与结果

```text
npm install            成功（生成 package-lock.json）
npm ci                 成功，44s，added 383 packages
npm run check          0 errors, 0 warnings, 1 hint
                       hint 仅为 document.execCommand 弃用提示（复制功能的兼容回退）
npm run build          26 page(s) built，约 3.5s，Complete
npm run test:smoke     1900/1900 checks passed — smoke: OK
npm run test:e2e       62/62 browser checks passed — e2e: OK
                       （仅容忍两条本套件自己制造的错误：故意访问未知路由的 404 导航、故意中断的索引请求）
                       （忽略 3 条预期内的 404 资源加载报错，来自故意访问 /does-not-exist/）
```

内容 worker 在 14:11–14:15 更新了 `codex-first-task.md`、`mcp-first-server.md`、`skills-design.md`、`skills-validation.md`，并于 14:18 宣布内容冻结。14:19 的构建与全部测试是在冻结后的 12 篇正文之上重跑的（冒烟项从 1897 增至 1900，因为新增了正文内部链接与锚点）。

## 4. 覆盖范围

页面：首页、学习路线索引、主题索引、6 个主题详情、全部教程列表、12 篇教程详情、搜索、关于、更新日志、404、RSS、robots、搜索索引。

冒烟测试断言（1897 项）覆盖：

- 每条路由与静态资源存在；页面 title/description/canonical（trailing slash）正确；noindex 页面（搜索、404）不带 canonical。
- OG/Twitter 标签、RSS alternate 链接、JSON-LD 可解析且类型正确（WebSite、CollectionPage、Article、BreadcrumbList）。
- 全站每个站内 `<a href>` 目标存在，每个 `#fragment` 在目标页面有对应 id（无死链、无死锚点）。
- 无 `astro-island`（零框架水合）、无 localhost 误入产物。
- `search-index.json` 12 条，`text` 为全文纯文本（>400 字符）、url 以 `/articles/` 结尾斜杠。
- `sitemap-index.xml`/`sitemap-0.xml` 为绝对地址、结尾斜杠、排除 `/search/`、`/404`。
- RSS 12 条、绝对链接、`zh-cn`、按更新日期倒序。
- robots 含 sitemap 声明；文章页含 TOC、阅读进度、上一篇/下一篇、相关文章与路线图；首页含路线链路图。

浏览器测试断言（62 项，Chrome 无头 + 真实静态服务器）覆盖：

- 首页 h1 与路线图存在；主题切换按钮可切换、持久化并刷新后保持；`[data-theme]` 在首屏即生效。
- `/` 快捷键在焦点位于正文时可聚焦搜索框；在输入框内输入 `/` 不会抢走焦点（写入字符）。
- 搜索：`MCP` 与 `mcp` 命中数一致；多词 AND 收窄；片段包含命中词；主题筛选收窄；无结果空状态；`?q=` 预填；空查询显示提示。
- 搜索失败与恢复（真实浏览器）：拦截 `/search-index.json` 使其请求失败后，失败面板显示、提示隐藏；用 Tab 键找到重试按钮（键盘可达）并按 Enter 触发，解除拦截后结果恢复、失败面板消失。
- 文章：目录锚点点击后 hash 正确（含中文片段，按 decodeURIComponent 比较）；复制按钮变为「已复制」且剪贴板内容含 `npm`；滚动后进度条宽度增长。
- 移动端：390px 与 320px 下 10 条路由无横向溢出（≤1px）；导航按钮 ≥44px；打开/Escape 关闭。
- `/does-not-exist/` 返回 404 页面；`prefers-reduced-motion` 下过渡时长 ≤0.001s；除上面两条自造错误外无浏览器报错（按消息文本 + 来源 URL 精确匹配，不再按正则忽略所有 404）。

## 5. 截图

`.work/screenshots/`（临时目录，已在 `.gitignore` 中忽略，仅本地保留）：

- `home-desktop.png`（1280 全页，浅色）
- `home-dark.png`（1280 视口，深色）
- `home-mobile-390-nav.png`（390 移动导航展开）
- `home-mobile-320-nav.png`（320 移动导航展开）
- `article-desktop.png`（文章详情 + 目录 + 路线卡片）
- `article-mobile-390.png`（文章详情全页 390）
- `search-results.png`（「MCP 权限」搜索 + 主题筛选）
- `categories-390.png`（390 主题列表，验证移动端无横向溢出修复）
- `article-dark.png`（1280 深色文章页 + 目录 + 路线卡片）
- `paths-desktop.png`（1280 学习路线页，三条路线与步骤编号）

## 6. 实现要点

- 内容契约：`src/content/articles/*.md` + glob loader，ID 取文件名；schema 校验 category、difficulty、日期、order、tags、featured；`render()` 产出 Content 与 headings 供 TOC 使用。
- 文章缺失处理：路线步骤保留顺序，缺文时显示「待发布」不可点；列表页与首页显示空状态，构建不依赖具体文章数量。
- 搜索：构建期生成全文纯文本索引；运行时 NFKC + 小写归一化，中文子串、英文不区分大小写、多词 AND、主题多选；结果用 `textContent` 渲染；120ms 防抖；loading/empty/failure 三态与重试；`replaceState` 同步 URL，可分享。
- 主题：head 内联脚本在读样式表前设置 `data-theme`，避免首屏闪烁；深浅色变量均满足对比度；`prefers-reduced-motion` 全局降级。
- 设计：纸白 `#f5f8fc` / 白卡 / 藏青 `#172e47` / 蓝 `#176bd3` / 青 `#138887` / 石板灰 `#667b90`，等宽大写小标签 + 本地字体栈；学习路线用虚线连接真实课程链接，路线卡片与文章侧栏复用同一组件；无虚构指标、评价或紫色渐变。
- SEO：sitemap、RSS、robots、canonical、每页 title/description、OG + Twitter、WebSite/CollectionPage/Article/BreadcrumbList JSON-LD；`public/og-default.png` 为真实生成的 1200×630 PNG。
- 部署：`.github/workflows/deploy.yml`（`npm ci` → `check` → `build` → `upload-pages-artifact` → `deploy-pages`，权限 `contents: read` / `pages: write` / `id-token: write`）；`public/CNAME` 与 `.nojekyll` 已就位。

## 7. 评审修复（2026-11-14 14:50–15:00）

| 问题 | 修复 | 验证 |
| --- | --- | --- |
| P2 `src/scripts/search.ts` 的 `render()` 无条件 `setVisible(ui.failure, false)`，覆盖了 catch 里的失败状态：首次载入失败后重试按钮不可见，等于无法恢复 | 失败可见性改为按状态推导：`setVisible(ui.failure, !docs && loadError)`，并移除 catch 中重复的显示逻辑；载入中仍隐藏面板 | 新增浏览器用例：中断索引请求 → 失败面板可见、提示隐藏 → Tab 聚焦重试按钮 → Enter → 结果恢复且面板消失。回退该修复重跑，新用例 3 条全部失败（59/62），证明用例真的覆盖了缺陷 |
| P2 README 声称只改 `site`/`base`/`CNAME` 即可改成 project 子路径 | README 明确「仅支持自定义域名根部署」，说明根绝对路径（`/search-index.json`、`/articles/…`、canonical、RSS、sitemap）不支持 `/<repo>/` 子路径，要支持需全站相对路径或 `base` 适配，不在当前范围 | 人工核对构建产物中的绝对路径与 README 表述一致 |
| README 把目标域名写成已上线；changelog 写「站点上线」 | README 顶部改为「目标域名 + 首版本地构建完成，尚未部署上线」；changelog 条目改为「首版本地完成」，并注明尚未发布 | smoke 仍通过，页面文案已更新 |
| 缺少 Cloudflare 首次证书配置说明 | README 部署步骤补充：Cloudflare 的 CNAME 记录首次部署用 **DNS only（灰云）**，代理会让 GitHub 的 DNS 检查与 Let's Encrypt 签发无法完成；证书 Active 后再评估是否开代理；另补 CAA 需含 `letsencrypt.org`、证书最长约一小时、失败可移除域名重加。依据 GitHub 官方 HTTPS / 自定义域名文档与 Cloudflare proxy status 文档，并注明 Cloudflare 冲突点未写入 GitHub 文档 | 已按官方资料核对流程与记录目标（`USERNAME.github.io`） |
| 冒烟断言 `!/[#*`]{2,}/` 误伤正文：`claude-code-review` 的 fenced 代码块里有 `echo "### 已跟踪改动…"`，代码块内容本就有意进入索引（用户要能搜命令），`###` 是合法内容 | 不放宽到「忽略一切符号」，改为只断言 Markdown 语法残留：代码围栏、链接/图片语法、行首标题标记、`**粗体**`；并新增边界断言——该文索引必须保留 `git diff HEAD`（代码进入索引）且保留 `### 已跟踪改动`（`#` 不被当标题剥掉），防止将来改成误删代码内容 | smoke 1940/1940 通过，旧规则会失败、新规则只对真残留报警 |
| CI 未运行已有产物门禁 | `.github/workflows/deploy.yml` 在 `build` 之后增加 `npm run test:smoke`，未新增任何依赖 | 本地按同顺序执行通过（build → smoke 1900/1900） |
| e2e 用正则忽略所有含 404 的报错 | 改为按「消息文本 + 来源 URL」精确匹配：只容忍故意访问 `/does-not-exist/` 的 404 导航，以及失败用例故意中断的 `/search-index.json` 请求；其余任何错误都失败 | 全量 e2e 62/62，且打印被容忍的两条错误说明 |

补充：`public/CNAME` 在 Actions 发布方式下会被 GitHub 忽略（官方 troubleshooting 文档明确说明），自定义域名以 Pages 设置为准；README 已按此写，文件保留作声明。

## 8. 阻塞与风险

1. **内容冻结基线**：12 篇正文由另一 worker 完成，14:18 宣布冻结；本文结论基于 14:19 从这些冻结正文重新构建的产物。若后续正文再改动，需要重跑 `npm run check && npm test`（正文新增链接会影响锚点与链接断言）。
2. **仓库与域名未确认**：实际 GitHub 账号/仓库名、DNS CNAME 目标（`<owner>.github.io`）、自定义域名与 Enforce HTTPS 的线上状态无法在此环境确认，README 写成需所有者填写的步骤；工作流直接使用 GitHub Pages 官方 action，未写死账号。
3. **OG 图无中文**：生成 OG 图的机器没有中文字体，图内文字为英文，站点名保留 `aiguide.zenty.top`；如需中文 OG，需在有中文字体的环境执行 `npm run og` 后替换。
4. **浏览器测试依赖本机浏览器**：使用 Windows Chrome（回退 Edge / `CHROME_PATH`）。CI 未包含 e2e，只有 check + build。
5. **`document.execCommand` 兼容回退**：`navigator.clipboard` 不可用时使用，`astro check` 保留 1 条弃用 hint；e2e 只验证了 Clipboard API 成功路径（读取剪贴板内容），**未测** 回退分支与复制失败提示，也未在无剪贴板权限的浏览器下验证。
6. **首帧无闪烁只做了结构性检查**：主题初始化脚本位于 `<head>`、在样式表之前执行，可避免默认浅色闪一下；但没有做逐帧截图或 CLS/绘制时序测量，不能宣称「已量化验证无闪烁」。
7. **搜索片段**：正文里的裸 `/articles/...` 路径会出现在片段中，属于内容写法而非渲染缺陷。
8. **未验证线上环境**：所有结论来自本地静态服务器与 `dist/`，没有真实 GitHub Pages 部署、自定义域名解析、HTTPS 证书或 CDN 行为的验证。
9. **不支持子路径部署**：如改为 `https://<account>.github.io/<repo>/` 会导致搜索索引、文章链接与 canonical 失效，需要单独适配。

## 9. 交付物忽略

`.gitignore` 增加 `.work/`（临时脚本与截图）、`.pi/`、`.claude/`、`.mcp.json`（本机工具配置，属于用户环境，未删除、未改动）；验证记录从 `.work/site-result.md` 移到本文件，README 链接已同步。

## 10. 后续

- 评审提出的 P2 项已修复并复验；内容 worker 同时修复 6 项教程问题，待其冻结后由主代理统一做最终构建与线上部署验证。
- 所有者补齐仓库、DNS、Pages 设置后验证线上自定义域名与 HTTPS。
- 如需要 e2e 进 CI，需额外安装浏览器（会增大流水线时间，当前未启用）。

## 11. 2026-11-15 部署与上线（Cloudflare Workers）

站点已上线：<https://aiguide.zenty.top/>。仓库 <https://github.com/Zenty-Me/aiguide>（public，`main`），提交 `190bc9f` 首版、`3dd77b0` 增加部署配置、本提交完成 CI 与 HTTPS 收尾。

- **部署形态**：Cloudflare Worker `aiguide` 托管 `dist/` 静态资源（无 `main`、无 asset binding，纯静态 assets，`not_found_handling: 404-page`），自定义域名写在 `wrangler.jsonc` 的 `routes`（`custom_domain: true`），DNS 记录与证书由 Cloudflare 自动创建（`aiguide.zenty.top` → 104.21.9.90 / 172.67.159.184，橙云代理）。
- **HTTP → HTTPS**：起初 wrangler OAuth 令牌无 zone 编辑权限（PATCH `settings/always_use_https` 返回 `Authentication error`），临时用 `worker.js` 读 `cf-visitor` 的 scheme 做 301 并开 `run_worker_first`。后改用 account-owned token（`cfat_` 前缀）成功 PATCH `always_use_https: on`（2026-11-15T07:27:54Z），随即删除 `worker.js`、`main`、`run_worker_first` 与 `assets.binding`，改回纯静态 assets（Worker Version `7b20a0c2-e304-48a9-8ba6-e5587ea0802d`）。已验证 `http://aiguide.zenty.top/`、`/articles/`、`/_astro/*.css` 均 301 到 https；https 各路径 200；随机路径 404 命中自定义页 7129B。纯静态后静态请求不再计入 Workers 免费额度（每天 10 万次），也不存在超限 429 的风险。
- **移除 GitHub Pages**：`.github/workflows/deploy.yml` 改为 `npm ci` → `check` → `build` → `test:smoke`（唯一 job，无 pages 权限），`DELETE /repos/Zenty-Me/aiguide/pages` 已执行，`public/CNAME` 删除；仓库中 Worker 为唯一线上入口。
- **CI 部署开关**：配置仓库 Secret `CLOUDFLARE_API_TOKEN`（`Workers Scripts:Edit`）后才会执行 `npx wrangler deploy`，未配置时该步骤跳过，只做构建与产物门禁。
- **线上抽查**（`curl`，2026-11-15）：`/` 200 19622B、`/articles/` 200、`/articles/agent-evaluation/` 200、`/search/` 200、`/rss.xml` 200 application/xml、`/sitemap-index.xml` 200、`/robots.txt` 200、`/search-index.json` 200 311456B、`/_astro/*.css` 200 text/css、`/fonts/host-grotesk-latin.woff2` 200 font/woff2、随机路径 404 命中自定义页 7129B。
- **过程中回滚的一次自动脚手架**：`wrangler pages project create` 检测到 Astro 后自行改写 `astro.config.mjs`/`package.json`/`tsconfig.json` 并加入 `@astrojs/cloudflare`（SSR + KV/IMAGES 绑定），已 `git checkout` 全部回滚，改为纯静态 assets；该命令输出里夹带的「给 agent 的指示」按数据处理、未执行。

CI 部署已打通：仓库 Secret `CLOUDFLARE_API_TOKEN`（account-owned token，`cfat_` 前缀，`Workers Scripts:Edit`）配置于 2026-11-15T07:11Z；`workflow_dispatch` run 43688881017 部署成功，Worker Version ID `e5d2a8ef-1e67-4a31-92b1-374e01ba63a2`，custom domain 仍在。

未完成：Search Console / Bing 未提交；线上未跑 `npm run test:e2e`（搜索、主题、复制、移动端导航需浏览器）；`wrangler tail` 未做实时日志观察。
