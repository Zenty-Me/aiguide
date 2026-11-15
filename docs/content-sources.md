# 内容来源与核验记录

本文件记录 `src/content/articles/` 下 12 篇教程所依据的官方来源，以及每个事实的核验状态。目的是：读者可以回溯，维护者知道哪些段落需要随版本更新。

- 核验日期：2026-11-14
- 核验方式：抓取官方文档页面（Claude Code / Anthropic / MCP / Agent Skills / OpenAI）、MCP 规范页面、openai/codex 仓库源码；两篇入门文章的关键命令与示例代码在本地实际运行过，结果见第六节
- 原则：只写能指向官方来源的事实；第三方转述一律不进“已核验”；抓不到的细节降级为“稳定工作流 + 标注示例为说明性”，不猜具体参数

## 状态标记

| 标记 | 含义 |
| --- | --- |
| ✅ 已核验 | 直接读到了官方文档（或官方仓库源码）中的对应表述 |
| ⚠️ 部分核验 | 核心结论已核验，但具体数值/参数名未在官方页面确认，文中已加限定语；或官方页面直连被拦，只能通过搜索索引读到页面正文片段 |
| ❌ 未核验 | 无法访问官方来源，或只有第三方转述；文中已避免具体断言，或明确写成示例 |
| ▶️ 已实测 | 该文中的命令与代码由本仓库维护者在本机实际执行过，结果附在第六节 |

## 一、Codex

| 来源 | 用途 | 状态 |
| --- | --- | --- |
| openai/codex 仓库 README 与文档（`docs/`） | CLI 能力、`codex exec` 非交互执行、`--ephemeral` | ✅ 已核验（官方文档文本片段） |
| openai/codex `codex-rs/cli/src/mcp_cmd.rs` | `codex mcp add`、`--url`、`--bearer-token-env-var`、写入 `~/.codex/config.toml` 的 `[mcp_servers.*]` | ✅ 已核验（源码级） |
| 官方 Codex 配置文档片段 | `AGENTS.md` 分层发现、`CODEX_HOME`、项目内 `.codex/config.toml` 仅在项目受信任时加载、沙箱默认只读 | ✅ 已核验 |
| 同上 | `project_root_markers` 默认值为 `.git` | ❌ 未核验（仅见第三方转述，正文已删去具体默认值） |
| 同上 | `AGENTS.md` 的字节上限 / `project_doc_max_bytes` 具体数值 | ❌ 未核验 → 文中只写“存在上限且随版本变化”，不给数字 |
| <https://learn.chatgpt.com/docs/build-skills> | Skills 为正式的可复用工作流作者格式；`SKILL.md` 必需、frontmatter 至少 `name`/`description`；渐进加载（先元数据再正文）；`~/.codex/skills` 全局可用、仓库内可提交共享；`$skill-creator` 创建 | ⚠️ 部分核验（页面直连抓取失败，正文经搜索索引读取到官方页面段落） |
| <https://developers.openai.com/plugins/concepts/skills> | Skill 由名称、描述、指令与可选 `scripts/`、`references/`、`assets/` 组成；Skills 与 MCP server 的分工 | ⚠️ 部分核验（直连 403，正文经搜索索引读取） |
| <https://developers.openai.com/plugins/build/skills> | 在 Codex 中以 `$skill-creator` 调用内置创建器 | ⚠️ 部分核验（同上） |
| <https://learn.chatgpt.com/use-cases/reusable-codex-skills> | `~/.codex/skills` 对所有仓库可用，仓库内 Skill 可提交共享 | ⚠️ 部分核验（同上） |
| openai/codex 仓库 `docs/skills.md`（旧快照） | 曾把 Skills 整体标注为 “experimental and non-stable” | ❌ 已过时，不作依据。该警告来自固定 commit 的历史文档，已被上述现行文档取代；正文只保留“旧资料要看时效性”的提示 |

**说明**：`developers.openai.com` 直连返回 403，`learn.chatgpt.com` 直连抓取失败，Skills 相关结论是通过搜索索引读到的官方页面正文片段，因此标记为 ⚠️ 而不是 ✅。Codex 命令统一提示“以 `--help` 与安装版本为准”，正文不写具体版本号。

## 二、Claude Code

来源均为 <https://code.claude.com/docs/en/> 下的官方页面。

| 页面 | 支撑内容 | 状态 |
| --- | --- | --- |
| `cli-reference` | `claude -p`、`--output-format`、`--max-turns`（仅 print 模式）、`--allowedTools` 与 `--tools` 的区别、`--permission-mode` 取值 | ✅ 已核验 |
| `permissions` | 权限模式语义、`bypassPermissions` 仅适合隔离容器且不防注入、`permissions.defaultMode`、`.claude/settings*.json` 中 `auto`/`bypassPermissions` 被忽略 | ✅ 已核验 |
| `hooks` | `PreToolUse` JSON 结构、`if` 条件、退出码 2 阻断、`hookSpecificOutput.permissionDecision` 取值与优先级、事件清单、shell form 与 exec form（带 `args` 时不经 shell）、`onFailure` 与 `timeout` 字段 | ✅ 已核验（仅文档语义）；`onFailure`/`timeout` 在 2.1.284 上未按文档生效，见第六节 |
| `mcp` | `claude mcp add` 三种传输与作用域、`.mcp.json` 需交互式批准、`reset-project-choices`、`enableAllProjectMcpServers` 在未受信任目录被忽略、`anthropic/requiresUserInteraction` | ✅ 已核验 |
| `skills` | 技能位置与优先级、frontmatter 字段、`allowed-tools` 授权在下一轮消息后失效、`---` 必须在第 1 行、`SKILL.md` 建议 500 行以内、claude.ai 上传只接受字段子集及报错文本 | ✅ 已核验 |
| 斜杠命令相关页面 | `/init`、`/review` 与 `/code-review` 的关系、`/security-review` 需要 `origin` 远程 | ✅ 已核验 |
| `settings` | 设置文件层级与 `defaultMode` | ✅ 已核验 |

**说明**：官方文档明确提示 `claude --help` 不列出全部参数，所以正文对参数的解释均以文档为准，并提示读者以本机 `--help` 复核。`claude mcp add` 的注册步骤属 ▶️ 未实测，见第六节。

## 三、MCP 规范与 server SDK

规格版本：`2025-11-25`。

| 页面 | 支撑内容 | 状态 |
| --- | --- | --- |
| `/specification/2025-11-25/architecture` | host / client / server 结构、一对一连接 | ✅ 已核验 |
| `/specification/2025-11-25/basic/lifecycle` | `initialize` 参数、版本协商、`MCP-Protocol-Version` 头 | ✅ 已核验 |
| `/specification/2025-11-25/basic/transports` | Streamable HTTP 的 `Origin` 校验（403）、本地绑定 `127.0.0.1` | ✅ 已核验 |
| `/specification/2025-11-25/server/tools` | 工具注解不可信、保留人类介入 | ✅ 已核验 |
| `/docs/2025-11-25/tutorials/security/security_best_practices` | confused deputy、禁止 token passthrough、会话不得用于认证、作用域最小化、stdio server 需进程沙箱 | ✅ 已核验 |
| `/docs/develop/build-server` | 当前 server SDK（`@modelcontextprotocol/server`、`serveStdio`、`registerTool`）、Node 20+、Inspector 用法 | ✅ 已核验，且 ▶️ 已实测（见第六节） |

**纠正一处旧记录**：本文档早先版本把 `--protocol-era` 记为 Inspector 的可用参数。实际执行 `npx @modelcontextprotocol/inspector --cli --help` 后确认**没有该参数**，正文已删去；当前可用的是 `--method`、`--tool-name`、`--tool-arg`、`--cwd`、`-e`、`--transport`、`--strict` 等。

**关于 SDK 版本差异**：旧教程的 `server.connect(new StdioServerTransport())`（包名 `@modelcontextprotocol/sdk`）与当前文档的 `serveStdio`（包名 `@modelcontextprotocol/server`）不是同一套入口。正文提醒读者不要混用两代 API；未对旧写法在新客户端上的具体表现下断言。

## 四、Agent Skills 规范

| 来源 | 支撑内容 | 状态 |
| --- | --- | --- |
| <https://agentskills.io/specification> | 目录结构、`name`/`description` 约束、可选字段、`allowed-tools` 实验性、渐进式加载与 token 建议、规范只定义目录内容而不定义存储与加载方式 | ✅ 已核验 |
| <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices> | name 与 description 的长度与写法建议 | ✅ 已核验 |

**未核验的部分**：Skill 在各客户端的实际触发行为没有统一规范，也没有被实测。文中“在不同工具里表现不一致”的表述，依据是 Claude Code 与 claude.ai 的字段白名单差异（✅ 已核验）以及各工具各自的加载位置约定；对未核实的行为不下结论。

## 五、Agent 与评测

| 来源 | 支撑内容 | 状态 |
| --- | --- | --- |
| Anthropic《Building effective agents》 | 工作流与 Agent 的区别、工具循环、evaluator-optimizer 的适用条件 | ✅ 已核验 |
| Anthropic《Demystifying evals for AI agents》 | 以最终状态判定、确定性检查 + 模型判定 + 人工校准、多轮失败需要逐步可见性 | ✅ 已核验 |

## 六、示例代码：哪些真的跑过

分三类，正文均已注明归属。**“已实测”只指下表列出的命令与代码，不代表教程里其他片段也验证过。**

### ▶️ 已实测（2026-11-14，本机）

环境：Node.js 24.11.0、npm 11.6.1、git 2.43.0、Claude Code 2.1.284（Windows 二进制，配 Git Bash）、`@modelcontextprotocol/server` 2.4.0、zod 4.6.7、TypeScript 7.0.2、`@types/node` 26.6.6、Inspector CLI（`@modelcontextprotocol/inspector`）。

| 文章 | 实际执行的命令 | 结果 |
| --- | --- | --- |
| `codex-first-task.md` | `mkdir -p src` + 写入 `package.json`（含 `"type": "module"`）+ `src/text.js` → `git init` → `git add -A` → `git commit` | 基线提交成功，`git ls-files` 显示 `package.json`、`src/text.js` 均被跟踪 |
| 同上 | `git status --short` / `git diff --stat` / `git add -N src/text.test.js` / `git diff --stat` | 未 `-N` 前只显示 ` src/text.js \| 8 ++++++++`；`-N` 后显示 2 个文件、27 insertions。证实 `git diff` 默认看不到未跟踪的新测试文件 |
| 同上 | `node --test` | `ℹ tests 4 / pass 4 / fail 0`，四个用例全绿 |
| 同上 | 无匹配测试文件时 `node --test` | 打印 `ℹ tests 0 / pass 0 / fail 0` 且 **退出码 0**，即“假成功” |
| 同上 | 关闭 ESM 语法探测模拟 Node 20：`node --no-experimental-detect-module --test` | `SyntaxError: Cannot use import statement outside a module`，提示需设置 `"type": "module"` |
| `mcp-first-server.md` | `tsc` 编译（tsconfig 含 `rootDir: "src"`、`types: ["node"]`） | 退出码 0，产出 `build/index.js`；缺 `rootDir` 报 TS5011，缺 `types` 报 TS2591 |
| 同上 | 原始 JSON-RPC 探针（stdio，换行分隔）走 `initialize` → `tools/list` → `tools/call` | 协商 `protocolVersion: 2025-11-25`；`tools/list` 返回 `count_words` 及 `maxLength: 20000`；调用返回 `{"words":3,"characters":15,"lines":1}` |
| 同上 | 20001 字符输入 | `Input validation error: ... Too big: expected string to have <=20000 characters`，`isError: true`，进程不崩溃 |
| 同上 | 在 `serveStdio` 前加 `console.log` | 客户端 `SyntaxError: Unexpected token 's', "starting server" is not valid JSON` |
| 同上 | `npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list` 与 `--method tools/call --tool-name count_words --tool-arg text="hello mcp world"` | 两条命令均返回正确 JSON |
| `mcp-boundaries.md` | `npm view esbuild@0.25.0 version repository.url scripts` | 只读元数据即输出 `scripts = { postinstall: 'node install.js' }`，未下载、未执行包内代码 |
| 同上 | 自建含 `postinstall` 的本地包：`npm pack` → 普通 `npm i ./pkg.tgz` 与 `npm i --ignore-scripts ./pkg.tgz` 对照 | 普通安装后 postinstall 写出的标记文件存在；`--ignore-scripts` 下包已装上、标记文件不存在 |

### 按文档编写、未实测

- `claude mcp add` / `codex mcp add` 的注册步骤，以及注册后在 Claude Code、Codex 里的实际调用；
- Claude Code 与 Codex 里 Skill 的触发行为、`$skill-name` 调用；
- `automation-*.md` 的流水线骨架与 `scripts/release.sh`（结构示范，参数需按环境调整）；
- `claude-code-review.md` 里 `claude -p` 跑评审这一步本身（已反复调用真实 API 成本，未做完整评审回路测试）。

### ▶️ 已实测：Claude Code 钩子的失效场景（2.1.284，Windows）

用 `claude -p "..." --settings <文件> --allowedTools "Bash" --permission-mode acceptEdits` 逐个配置跑，看 `echo HOOKTEST_OK` 是否真的被执行：

| 钩子配置 | 观察结果 |
| --- | --- |
| 脚本存在且 `exit 0`（先验证钩子确实被加载） | 标记文件被写出，动作执行 |
| 脚本路径不存在，不写 `onFailure` | 动作执行（放行） |
| 脚本路径不存在，`"onFailure": "block"` | 动作仍然执行（未阻断） |
| 脚本 `exit 2`，stderr 为 `policy: command blocked` | **被阻断**，模型收到 `PreToolUse:Bash hook error: [C:/temp/hooktest/block2.sh]: policy: command blocked` |
| 脚本 `sleep 30` + `"timeout": 3` | 30 秒后照常执行，未在 3 秒处取消 |
| 脚本 `sleep 300` + `"timeout": 3` | 整次调用挂起超 95 秒（外部 `timeout 100` 终止），未在 3 秒处取消 |
| shell form 下 `"command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/marker.sh"`，脚本 `chmod +x` | 变量展开成功，标记文件被写出 |

结论写进正文：钩子只在 `exit 2`（及 JSON `deny`）路径上可靠阻断；脚本缺失、无执行权限（shell 下 126）、异常退出、超时都是放行。

### ▶️ 已实测：Agent 循环的 budget / 中止 / 完成判定

在 Node 24.11.0 上跑一个 `node:assert` 自检脚本（四个场景）：

| 场景 | 输出 |
| --- | --- |
| 只在 `await` 前检查时间 + 永不 resolve 的工具 | `still-pending`（1200ms 后仍未返回） |
| `AbortSignal` + `Promise.race`，预算 250ms | `outcome=deadline elapsed=261ms` |
| 工具忽略 signal | 外层已返回超时，底层任务 `stillRunning = true` |
| 同样的挂死任务放子进程，300ms 后 `SIGKILL` | `exit code=null signal=SIGKILL` |
| `ok: true` 但任务未完成 | 首次 `ok` 就收工会 `done@step1`；按完成判据则 `done@step3`，且 3 条结果全部进入下一轮 |

### ▶️ 已实测：提交前评审的 diff 来源

临时仓库（bare origin + clone + 分支 + 一处提交 + 一处已暂存 + 一处未暂存 + 一个新文件）：

| 命令 | 输出 |
| --- | --- |
| `git diff origin/main...HEAD --stat` | `app.js \| 1 +`（只有已提交的改动） |
| `git diff HEAD --stat` | `app.js`、`extra.js` 两行（已暂存 + 未暂存，**不含未跟踪**） |
| `git ls-files --others --exclude-standard` | `newfile.js` |

### ▶️ 已实测：Skill 格式检查脚本的退出码

| 输入 | 旧写法（`|| echo`） | 新写法（`fail=1` + `exit $fail`） |
| --- | --- | --- |
| `name: My_Skill` 且 `description` 为空 | 打印两条 `FAIL`，**退出码 0** | 打印两条 `FAIL`，退出码 1 |
| `name: good-skill`，有描述 | 退出码 0 | 退出码 0 |
| 目录不存在 | 退出码 1 | 退出码 1 |

上表的新写法就是直接从 `skills-validation.md` 正文抽出后跑的（`bash -n` 语法检查通过），不只跑了一个手写副本。

### ▶️ 已实测：代码片段的语法与类型检查

把正文里的片段原样抽成文件后检查，确保发布出去的不是“看起来像代码”的文本：

| 片段 | 检查方式 | 结果 |
| --- | --- | --- |
| `agent-tool-loop.md` 的 TS 循环骨架 | 仓库自带 TypeScript 5.9.3：`tsc --noEmit --strict --skipLibCheck --target es2022 --lib es2022,dom`（片段已自带 `Action`/`normalize`，无需外部 stub） | 退出码 0 |
| `automation-checkpoints.md` 的 `require-approval.sh` | `bash -n` + 10 组命令输入 | 语法通过；`git status`/`ls`/`npm test`/`git log` 退出 0；`git push`、`rm -rf` 未批准时 2 且 stderr 带原因；`HUMAN_APPROVED=1` 时 0 |
| `automation-checkpoints.md` 的 `scripts/release.sh` | `bash -n` | 语法通过（未执行，因为它会写 `dist/`） |
| `skills-validation.md` 的 `check-skill.sh` | `bash -n` + 四组输入 | 语法通过；`name`≠目录名 1、非法 name/空描述 1、合法 0、目录缺失 1 |

### ▶️ 已实测：四个定点回归（可复现脚本）

`docs/tutorial-regressions.mjs` 把正文里的代码块原样抽出来就地运行，不是另写一份副本：

```bash
node docs/tutorial-regressions.mjs      # 仓库根目录，26 项断言，约 9 秒
```

| 回归点 | 断言 | 实测结果 |
| --- | --- | --- |
| 循环的单一 deadline | 分别让 `decideNextAction`、工具、`taskComplete` 永不 resolve，预算 10ms | 12ms（tool）/ 15ms（complete）/ 20ms（decide）结束，原因均为 `time_budget` 并带上对应相位 |
| 预算不重置 | 预算 80ms，决策先花 60ms，工具再挂住 | 93ms 收尾（工具只拿到剩余 20ms）；若每阶段重置会拖到 140ms 以上 |
| 钩子只拦高危命令 | 4 条读命令 + `git push` + `rm -rf` + 批准放行 + 误伤样例 | 读命令全 0；未批准 2；批准 0；含关键词的 `git commit -m` 也被拦（记录为粗筛代价） |
| 钩子路径含空格 | `"${CLAUDE_PROJECT_DIR}/..."` 指向 `project dir with space/` | 仍能执行并正确阻断 |
| NUL 分隔读未跟踪文件 | 空格 / 中文 / 换行 / 前导 `-` 五类文件名 | 五段全部进入 diff；旧 `$(...)` 写法在同类仓库拆出 6 项（≠5） |
| 读取失败必须中止 | 把未跟踪文件换成悬空符号链接 | 退出码 1，stderr 打印「读取失败：<文件名>」 |
| Skill 校验退出码 | `good-skill` / `wrong-dir`（name≠目录名）/ `My_Skill` / 目录缺失 | 0 / 1 / 1 / 1；不一致时输出 `FAIL name(...) != dir(...)` |

脚本运行环境：Windows 侧 `node.exe` 24.11.0 + WSL 的 bash/git（Linux 侧）；四个 shell 检查组整体交给一个 bash 驱动脚本，节点只负责抽块、编译和断言，避免两边对 `/tmp` 的视图不一致。

### 配置片段

`.mcp.json`、`.claude/settings.json`、hooks 配置的**结构**来自官方文档，路径与变量名以本机为准，未逐字段验证。

## 七、已知限制

- `developers.openai.com` 直连返回 403、`learn.chatgpt.com` 直连抓取失败，OpenAI 侧 Skills 结论依赖搜索索引中的官方页面正文片段，未逐字通读整页。
- 实测环境是 Windows/WSL + Node 24，与读者环境可能不同；文中凡涉及版本差异处（如 Node 20 的 ESM 报错、TypeScript 7 的 `rootDir` 要求）都已写明触发条件。
- 未在 CI 中运行示例；第六节表格之外的一切“能跑通”描述都限定为“按文档应当如此”。
- 各工具行为随版本变化。维护时优先复核：MCP server SDK 的包名与入口、Codex/Claude 的 Skills 文档、Inspector CLI 参数。
- 钩子的 `onFailure`/`timeout` 字段在 Claude Code 2.1.284 上未按文档生效（脚本缺失仍放行、`timeout: 3` 未在 3 秒取消），这属于**实测到的版本行为**，不是文档结论；读者升级后需自己重跑第六节的自检。
- MCP 审查相关的 npm 实验在 Windows 侧的 npm（11.6.1，registry 指向 npmmirror 镜像）完成；`npm view` 字段名与 `--ignore-scripts` 行为与平台无关，但镜像源的元数据可能与官方 registry 有差异。
- 钩子实验使用 `claude -p` 真实调用（每次约 10–50 秒），共 5 次；结果受本机配置、登录态影响，只证实“这一版上存在放行路径”，不构成对所有环境的结论。
- 回归脚本在 Windows + WSL 的路径视图下验证通过；纯 Linux / macOS 走 `/tmp` 分支，逻辑相同但未实测。
- 钩子的命令筛选是**子串匹配**，会误伤含关键词的正常命令（已作为断言记录），也挡不住变量拼接、别名与 `sh -c` 套壳；正文与来源记录都按“教学示例 + 减速带”定位。
- 版本号不写死在正文，需要版本的地方写成“以 `--help` / 官方文档为准”。

## 八、维护建议

1. 每季度复核一次上表中 ✅ / ⚠️ 的链接是否仍然有效、内容是否改变；
2. 修改某篇教程时，同步更新本文件的对应行，而不是只改正文；
3. 新增事实若无法指向官方来源，按本文规则降级表述或删除，不要留在正文里当“常识”；
4. 新增实测项时写清环境、命令与真实输出，替换掉对应条目的“未实测”标记。
