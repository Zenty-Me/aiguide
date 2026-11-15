# 工具教程内容扩展记录

本次新增 12 篇 Codex / Claude Code 工具教程，并配套三个可离线复现的示例目录。事实核对以 `.work/content-research/` 中 2026-11-14 抓取的官方页面快照为准；快照首行保留了原始 URL。命令行为未在本机完整执行的部分，在表中明确标为“文档核对”，不把示例输出当成实测结果。

## 文章、来源与验证

| 文章 | 主要官方来源 | 验证方式与结果 |
| --- | --- | --- |
| `codex-install-login` | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[认证](https://learn.chatgpt.com/docs/auth)、[CLI 参考](https://learn.chatgpt.com/docs/cli/reference) | 文档核对安装、登录选择、`login status` 语义和 TLS 变量；未执行安装器或登录 |
| `codex-windows-setup` | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Windows 沙箱](https://learn.chatgpt.com/docs/windows/windows-sandbox)、[WSL](https://learn.chatgpt.com/docs/windows/wsl)、[gitattributes](https://git-scm.com/docs/gitattributes) | 文档核对 PowerShell 路径、原生/WSL 边界和换行符；未在 Windows 实机运行 |
| `codex-permissions` | [审批与安全](https://learn.chatgpt.com/docs/agent-approvals-security)、[配置](https://learn.chatgpt.com/docs/configuration) | 文档核对两层开关、受保护路径和拒绝诊断；未执行权限实验 |
| `codex-debugging-tests` | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[审批与安全](https://learn.chatgpt.com/docs/agent-approvals-security)、[Node 测试](https://nodejs.org/api/test.html) | **已离线运行** Node 内置测试：修复前 1 通过/2 失败、退出码 1；修复后 3 通过/0 失败、退出码 0 |
| `codex-noninteractive` | [非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)、[CLI 参考](https://learn.chatgpt.com/docs/cli/reference)、[JSON Schema](https://json-schema.org/) | **已离线校验** schema 样本：合法样本退出 0，非法样本退出 1；`codex exec` 本身未运行 |
| `codex-worktrees` | [git-worktree](https://git-scm.com/docs/git-worktree)、[审批与安全](https://learn.chatgpt.com/docs/agent-approvals-security) | **已离线运行** Git 2.43.0 fixture：同分支占用、脏工作树拒绝删除、合并后移除均符合预期 |
| `claude-code-install` | [安装](https://code.claude.com/docs/en/setup)、[CLI 参考](https://code.claude.com/docs/en/cli-reference) | 文档核对平台要求、原生安装和登录门槛；未重装或登录 |
| `claude-code-memory` | [记忆](https://code.claude.com/docs/en/memory)、[权限](https://code.claude.com/docs/en/permissions) | 文档核对加载顺序、`.claude/rules` 和 `/context all`；未启动新会话验证 |
| `claude-code-permissions` | [权限](https://code.claude.com/docs/en/permissions)、[CLI 参考](https://code.claude.com/docs/en/cli-reference) | 文档核对模式、deny→ask→allow 顺序和项目信任；未执行权限变更 |
| `claude-code-mcp` | [MCP](https://code.claude.com/docs/en/mcp)、[CLI 参考](https://code.claude.com/docs/en/cli-reference) | 复用既有 `mcp-first-server` 的本地服务器，文档核对作用域、`${VAR}` 和 `/mcp`；未连接服务器 |
| `claude-code-subagents` | [子代理](https://code.claude.com/docs/en/sub-agents)、[权限](https://code.claude.com/docs/en/permissions) | 文档核对 frontmatter 支持字段、工具限制和 worktree 语义；未创建或调用子代理 |
| `claude-code-troubleshooting` | [故障排查](https://code.claude.com/docs/en/troubleshooting)、[安装](https://code.claude.com/docs/en/setup)、[CLI 参考](https://code.claude.com/docs/en/cli-reference) | 文档核对只读检查、认证状态、`--safe-mode`、`/context all` 和 MCP 调试入口；未执行修复动作 |

## 离线 fixture 的实际结果

### 失败测试修复

目录：`.work/content-tools-examples/debugging-tests/`。`before/slug.js` 保留了修复前版本，`src/slug.js` 是修复后版本，`diff.patch` 只改这一处实现。

- 修复前：`npm test` 为 1 pass / 2 fail，退出码 1；失败断言出现 `actual: 'hello,-world!'`、`expected: 'hello-world'`。
- 修复后：3 pass / 0 fail，退出码 0；重复运行结果一致。
- 结论：测试文件未被修改，修复限定在 `src/slug.js` 的 slug 生成逻辑。

### Git worktree

目录：`.work/content-tools-examples/worktrees/run-20261114/`。仓库基线提交为 `1306227`，功能分支提交为 `86ebbbc`，合并提交为 `4611ce9`；功能 worktree 已在合并后移除。

- 在功能分支已被 `demo-feature` 占用时再次 `git worktree add`，退出码 128，报错含 `already used by worktree`。
- 对有未提交文件的 worktree 直接 `git worktree remove`，退出码 128，报错含 `contains modified or untracked files, use --force to delete it`；worktree 仍保留。
- 提交、合并、正常移除并删除分支后，`app.txt` 保留两行，`git status` 干净，历史仍保留功能分支提交。
- 未测试 `--force` 清理，也不把该选项作为教程建议。

### JSON 结果校验

目录：`.work/content-tools-examples/noninteractive/`。`schema.json` 要求 `summary`、`files`、`risk`，`risk` 只能是 `low`/`medium`/`high`，并禁止额外字段。

- `node validate.mjs valid.json`：输出 `valid`，退出码 0。
- `node validate.mjs invalid.json`：输出 `$: missing required files` 与 `$.risk: expected one of low, medium, high`，退出码 1。
- 该校验器是零依赖的教学子集，只覆盖本文 schema 所需的对象、数组、类型、枚举、必填和额外字段；不是完整 JSON Schema 实现。`codex exec --output-schema` 未实际调用。

## 限制

1. 官方文档抓取时间为 2026-11-14；安装器、CLI 参数和账号政策可能变化，执行前应以 `--help` 和官方页面为准。
2. 本机 Codex 命令包装器不可用，Codex 的安装、登录、沙箱、非交互执行均未实机验证；Claude Code 仅观察到本机版本号，未重装、登录或调用模型。
3. Windows PowerShell 示例未在 Windows 实机执行；原生 Windows 与 WSL 的路径、沙箱和凭据差异只按官方文档描述。
4. Git 与 Node 结果来自 WSL 本地 fixture，提交哈希仅用于记录本次示例，不是通用值。
5. 未运行 `npm check`/`npm build`，因为其他 worker 正在编辑同仓库；文章 frontmatter 只用独立脚本做了字段检查，最终仍应以 Astro 内容 schema 构建为准。
6. 教程中的账号计划、权限模式、MCP 作用域和子代理字段均以官方页面为证据，不包含定价、最新版本排名或用户账号测试结论。

## 本次文件

新增文章：

- `src/content/articles/codex-install-login.md`
- `src/content/articles/codex-windows-setup.md`
- `src/content/articles/codex-permissions.md`
- `src/content/articles/codex-debugging-tests.md`
- `src/content/articles/codex-noninteractive.md`
- `src/content/articles/codex-worktrees.md`
- `src/content/articles/claude-code-install.md`
- `src/content/articles/claude-code-memory.md`
- `src/content/articles/claude-code-permissions.md`
- `src/content/articles/claude-code-mcp.md`
- `src/content/articles/claude-code-subagents.md`
- `src/content/articles/claude-code-troubleshooting.md`

离线示例（关键文件）：

- `.work/content-tools-examples/debugging-tests/`：`package.json`、`src/slug.js`、`src/slug.test.js`、`before/slug.js`、`before.log`、`after.log`、`diff.patch`、`results.txt`
- `.work/content-tools-examples/worktrees/run-20261114/`：`demo-repo/`、`step1.log`、`branch-conflict.log`、`dirty-removal.log`、`final.log`、`results.txt`
- `.work/content-tools-examples/noninteractive/`：`schema.json`、`valid.json`、`invalid.json`、`validate.mjs`、`valid.log`、`invalid.log`

本记录：`docs/content-expansion-tools.md`。除上述文件外，未修改其他现有文件。