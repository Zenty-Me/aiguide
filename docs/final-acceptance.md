# 最终集成验收

验收日期：2026-11-14（Asia/Shanghai）。项目位置：`D:/code/aiguide`。

## 主代理实际执行

在最后一轮教程修订落盘后，从 Windows PowerShell 依次执行，整条命令退出码为 0：

- `node docs/tutorial-regressions.mjs`：PASS，26 条输出检查通过；直接提取正文代码验证全部异步阶段超时、累计预算、普通命令放行/高危命令阻断、特殊文件名收集、Skill 校验非零退出。
- `npm run check`：39 个文件，0 errors、0 warnings、2 hints（复制回退的弃用 API、回归脚本未使用的 WORK_POSIX 变量）。
- `npm run build`：26 个静态页面，RSS、搜索索引、robots、sitemap 等生成成功。
- `npm run test:smoke`：1940/1940。
- `npm run test:e2e`：62/62。仅容忍测试主动制造的未知页面 404 和被中断的索引请求两条错误。

桌面首页与移动分类截图已由主代理查看；截图留在本地 `.work/screenshots/`（不提交）。

## 独立评审及修复

按 AGENTS.md 使用 Orca 编排 Pi CLI / DeepSeek V4.1 Flash medium 开发，Codex CLI / GPT-6 Astra high 只读独立评审。独立评审运行了两轮，未修改项目文件；其 Orca 消息回报受沙箱限制，完整结果由主代理从终端记录接收。

首轮发现 2 项 P1、6 项 P2：钩子失败阻断承诺、执行未知包后才审查、搜索失败重试、Agent 超时覆盖、工具成功和任务完成混淆、未提交改动遗漏、格式校验退出码、子路径部署说明。修复由原开发 worker 完成。

限定复审确认 4 项解决，并指出剩余 4 个 P2 边界问题。最后一轮定点修复覆盖全部异步阶段的统一 deadline、钩子的命令筛选、NUL 分隔特殊文件名、Skill 目录名不匹配失败。主代理检查相关代码，并执行上述从正文提取的回归脚本确认修复。最后一轮没有再开启第三轮独立评审，不将其表述为独立评审无发现。

集成时搜索文本检查把代码字符串中的 `###` 误判为 Markdown。开发 worker 将断言改为具体 Markdown 语法检查，并保留代码可搜索性验证；正文和索引实现未为通过测试而删除有效内容。

## 交付范围与限制

- 完成首页、分类、三条学习路线、12 篇原创教程、文章阅读功能、搜索、关于、更新日志、404、深浅主题和响应式布局。
- 完成静态 SEO 元信息、RSS、sitemap、结构化数据、GitHub Pages 工作流及目标域名配置；CI 包含类型检查、构建和静态冒烟测试。
- 当前仅支持自定义域名根路径部署，不宣称支持 GitHub project Pages 子路径。
- 未初始化 Git、未配置远程仓库、未推送或部署；未修改 Cloudflare 账号或 DNS。实际 GitHub owner/repository 尚需确认。
- 线上 DNS、证书签发与 HTTPS 尚未验收。部署操作见 README。
- Clipboard 兼容回退与失败提示、主题首帧无闪烁未做完整浏览器场景验证；OG 分享图目前为英文。
- 教程 hook 筛选属于说明性示例，不能解析所有 shell 变体，也不是发布安全边界；未实测的客户端注册、Skill 触发等见 `docs/content-sources.md`。

没有未解决的已知 P1/P2 网站核心功能问题；以上未验证范围不计为已经通过。
