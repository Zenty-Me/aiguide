# 内容扩充评审修复记录

日期：2026-11-14

本文件记录两份评审报告（`.work/content-review-tools-result.md`、`.work/content-review-systems-result.md`）与主流程补充检查中确认的 P1/P2 问题的修复。只覆盖列出的问题，不含无关重写；历史验证报告（`content-expansion-tools.md`、`content-expansion-systems.md` 等）保持原样。

## Codex 示例的命令顺序（P1）

`--ask-for-approval` 是全局选项，写在 `exec` 之后会报 `unexpected argument '--ask-for-approval' found`（本机 precheck：`codex exec --ask-for-approval never --help` 退出码 1）。所有示例统一为：

```text
codex --ask-for-approval never exec --sandbox read-only ...
codex --ask-for-approval never exec --json --sandbox read-only ...
```

| 文件 | 改动 |
| --- | --- |
| `src/content/articles/codex-install-login.md` | 命令改为全局参数前置（:109）；预期结果改写为「进度写 stderr、最终 agent 消息写 stdout，终端里两者连续显示」；常见失败补参数位置说明 |
| `src/content/articles/codex-noninteractive.md` | 5 处命令前置（:31、:52、:62 `--json` 变体、:98、:142）；新增参数位置段落；常见失败 1 补报错原文 |
| `src/content/articles/codex-permissions.md` | 命令前置（:48）；前置条件改为「后文使用 Bash 语法」，并补 PowerShell 等价 `Test-Path probe.txt` |
| `src/content/articles/codex-windows-setup.md` | 命令前置（:115）；第二步补 `git init` + 基线提交，使 `git ls-files --eol` 有仓库可用；`gitattributes` 围栏改为 ```text |
| `src/content/articles/codex-debugging-tests.md` | 复现失败后补基线提交，`git diff --stat` 只显示 Codex 的修改 |
| `src/content/articles/codex-worktrees.md` | 删除提交前的只读评审；改为第三步提交后 `git --no-pager diff HEAD...feature/worktree-demo` + 前置参数的只读评审（`HEAD` 为原主工作树当前分支，需干净状态）；说明 `demo-feature` 是目录名、分支是 `feature/worktree-demo` |

## skills-resources：公开可下载的 Skill（P2）

- 新增 `public/examples/change-summary/`，只包含 5 个目标文件：`SKILL.md`、`scripts/collect-change-facts.mjs`、`references/review-checklist.md`、`references/sample.diff`、`assets/summary-template.md`；不含日志、fixture 日志或凭据。
- `src/content/articles/skills-resources.md` 新增「先拿到这五个文件」表格，逐个链接 `/examples/change-summary/...` 并给出 `.claude/skills/change-summary/...` 保存路径；另给浏览器右键另存说明和 `curl` 批量下载片段。public/ 直接映射站点根，静态构建后链接仍指向真实文件。
- 脚本修复两个解析缺陷：Git 对非 ASCII 路径输出 C 引号时此前被当成前缀失败（新增 `unquoteGitPath` 按字节还原 UTF-8），且新 `diff` 头失败时不会重置上一文件状态（现任何非 git 头的 `diff ` 行直接 `INVALID_DIFF`）。`diff --cc` 等合并 diff 明确拒绝。
- 文章内嵌 ```js 块与 `public/examples/change-summary/scripts/collect-change-facts.mjs` 字节一致（11219 字节）；`.work/content-systems-examples/skills/change-summary/scripts/collect-change-facts.mjs` 同步为同一内容。
- 自测断言由 14 增至 17（中文引号路径、非法头），输出改为 `self-test ok (17 assertions)`。

## Claude Code 系列（P2）

| 文件 | 改动 |
| --- | --- |
| `claude-code-subagents.md` | 评审输入改为 `git diff HEAD`（含 staged 与 unstaged）；`git ls-files --others --exclude-standard` 只列出未跟踪文件，由人工挑选批准路径后以 `git diff --no-index -- /dev/null <path>` 追加；明确不自动 `git add` 来源不明的文件；`test -s` 检查输入非空；说明临时 diff 自身不会被计入；补已提交区间 `git diff origin/main...HEAD` |
| `claude-code-mcp.md` | `.mcp.json` 删除凭空发明的 `WORDS_TOKEN` 与 `env` 段（该示例不需要 token）；给出 Bash 与 PowerShell 的 `WORDS_SERVER_ENTRY` 设置，标注为必须替换的绝对占位路径；凭据说明单独成段 |
| `claude-code-memory.md` | 路径规则验证改为先读取一个真实命中的文件再提问，并说明规则只在 Read/Write/Edit 或单文件读取时加载 |
| `claude-code-install.md` | 按官方对比表改写：原生 Windows 不支持沙箱；WSL2 支持；WSL1 在 WSL2 不可用时仍可运行但不支持沙箱 |
| `claude-code-permissions.md` | `Read` deny 说明改为「也拦截 Bash 中可识别的 `cat`/`head`/`tail`/`sed`/`tee` 与重定向目标，但不覆盖未具名读取和自行打开文件的子进程，OS 级需 sandbox」；`-p` 与项目 allow 的两处改为以「目录从未被信任」为条件 |
| `claude-code-troubleshooting.md` | 同步信任条件，不再把非交互一概描述为忽略项目 allow |

## Skills / Agent / 自动化（P2）

| 文件 | 改动 |
| --- | --- |
| `skills-team-workflow.md` | 第三条命令改为 `git diff main...HEAD -- .claude/skills/release-check`；回滚改用 `git restore --source=<old-sha> --staged --worktree -- <path>`，并说明会删除旧版不存在的文件 |
| `agent-vs-workflow.md` | 在普通前缀判断前识别 Conventional Commits 的 `!` 返回 `major`；表驱动测试表补 `feat!: drop v1 client` 行 |
| `automation-secrets.md` | `secrets:` 改为映射写法 `{ API_TOKEN: "${{ secrets.API_TOKEN }}" }`，并说明需在 `on.workflow_call.secrets` 声明同名输入 |
| `mcp-tool-design.md` | 明确 `.min(1)`/`.strict()` 是对 `mcp-first-server` 原契约的有意收紧（原实现只限制字符串与 20,000 上限），并要求针对新 schema 补空串、超长、额外字段三条测试；不暗示跑在旧实现上的测试能证明新语义 |

## 实际执行的检查

| 检查 | 结果 |
| --- | --- |
| `node public/examples/change-summary/scripts/collect-change-facts.mjs --self-test` | `self-test ok (17 assertions)`，退出码 0 |
| `--diff public/examples/change-summary/references/sample.diff` | `ok:true`，3 个文件，合计 +5/−2（`docs/usage.md` +2/−1、`src/summary.js` +2/−1、`tests/summary.test.js` +1/−0），无 warnings |
| 临时仓库（项目内 `.work/tmp-review`，验证后删除）复现 `claude-code-subagents` 的输入流程 | `git diff HEAD` 同时捕获 staged 与 unstaged；`git ls-files --others --exclude-standard` 列出 `newfile.ts` 与 `review-input.diff`；追加 `--no-index` 后解析结果为 `tracked.txt` +2、`newfile.ts` 新增 +1，临时 diff 未计入 |
| `git diff --no-index -- /dev/null <file>`（有无 `--` 两种写法） | 均输出新文件 diff，退出码 1 属预期 |
| 文章围栏与 public 脚本逐字节比较 | 一致，11219 字节；fixture 副本同步后一致 |
| 文章 5 个 `/examples/change-summary/...` 链接与 public 目录对照 | 一一存在 |
| `feat!:` 等 4 个输入跑文章中的 breaking 正则 | `feat!: ...`、`docs!: ...` 命中，`feat(api): ...`、`fix: ...` 不命中 |

## 未执行与限制

1. 未运行 `npm run check`、`npm run build`、`npm run test:smoke`、`npm run test:e2e`：按分工由主流程在集成后统一执行，本轮只做上述离线检查。因此新链接在真实构建产物中的可达性、内容 schema 校验尚未经 Astro 验证。
2. 未调用 Codex、Claude Code、任何模型或真实 MCP server；所有 CLI 输出与 agent 行为均为文档整理或示意，不是端到端实测。Codex 的参数结论来自官方 `--help` 快照与本地 precheck，未执行安装、登录、沙箱或 `exec`。
3. `agent-vs-workflow.md` 的路由逻辑仍只是结构示例，未编译、未跑表驱动测试；新增的 `!` 规则只用同一正则在 Node 中做了输入级验证。
4. 收紧后的 `.min(1)`/`.strict()` 没有对应实现与测试，文章只说明契约变化与应补的用例。
5. `git diff HEAD` 方案覆盖已跟踪文件的暂存与未暂存改动；未跟踪文件仍需人工挑选路径，二进制文件与超长 diff 的处理未在文中展开。
6. 解析器只接受常规 `git diff` 文本与 `--no-index` 单文件输出；`diff --cc`、`diff --combined` 等合并且多父的 diff 会以 `INVALID_DIFF` 拒绝，不做合并语义推断。
7. 公开示例文件的许可证与归属沿用 `SKILL.md` 与站点约定；本轮未新增依赖、未打包、未引入 zip 工具。

## 最终修正（rereview P2 收尾）

`claude-code-permissions.md` 第五步与诊断 #4 删除了“信任祖先/父目录即可让项目 `allow`、`additionalDirectories` 生效”的表述：官方明确 Trusting a parent folder doesn't count for these rules，必须对该项目文件夹本身接受信任对话框，`-p`/SDK 同样如此；保留“此前已显式信任该项目文件夹则 `-p` 生效、从未信任则不生效并告警”的区分。原文见 `.work/content-research/claude-permissions.txt:792`。
