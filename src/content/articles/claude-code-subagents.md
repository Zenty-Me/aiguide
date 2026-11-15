---
title: "给 Claude Code 加一个只读评审子代理"
description: "在 .claude/agents 中定义一个只拥有 Read、Grep、Glob 的评审员，把 diff 作为输入，要求带文件行号的证据输出，并看清共享工作树不是安全隔离。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 170
tags: ["Claude Code", "子代理", "代码评审", "权限", "Agent"]
featured: false
---

## 目标：让评审有独立角色，但不越过只读边界

子代理适合做一类边界清楚、可以单独验收的工作，例如“只读审查这份 diff，按严重级别列出问题”。它不应该被当成“更聪明的主会话”，也不应该在没有约束的情况下拿到写权限。

本文定义一个项目级只读评审员：只能读文件、搜索和匹配路径，不能编辑、不能执行命令；输入是一份 diff 文件，输出必须带文件与行号证据。最后会单独说明：共享工作树不是安全隔离，工具限制也不是万能的。

## 前置条件

- 已安装并登录 Claude Code。
- 一个 Git 仓库，当前有可审查的改动；没有改动就先制造一个小的、无害的 diff。
- 知道项目根目录。子代理文件放在项目根的 `.claude/agents/`，不是用户主目录，除非你确实想全局使用。

## 第一步：写代理文件

```bash
mkdir -p .claude/agents
```

创建 `.claude/agents/code-reviewer.md`：

```markdown
---
name: code-reviewer
description: 只读审查 diff，按严重级别报告可定位的问题
tools: Read, Grep, Glob
model: sonnet
---

你是只读代码评审员。输入是仓库根目录的 review-input.diff，
以及 diff 中引用到的源文件。不要修改任何文件，不要执行命令。

对每个发现给出：
- 严重级别：blocker / major / minor
- 位置：文件路径:行号
- 证据：引用相关代码或 diff 片段
- 建议：最小修复方向，不直接改代码

只报告能从输入中证实的问题。没有发现时明确写“未发现需要阻塞的问题”，
不要为了凑数编造问题。不要假设你拥有主会话的完整上下文。
```

frontmatter 从文件第一行 `---` 开始。`name` 和 `description` 是必需项；`tools` 限定可用工具；`model` 选择该代理使用的模型。这里只保留这四个字段，减少版本差异带来的解析问题。当前版本支持的其他字段（例如 `permissionMode`、`maxTurns`）可以在确认本机版本后再加，不要从旧文章复制一长串未知键。

## 第二步：准备一份可审查的输入

先明确范围。`git diff` 只看未暂存的改动：全部暂存后它会变空，未跟踪的新文件也永远不出现。用 `HEAD` 作基线才能拿到已跟踪文件的全部改动：

```bash
git diff HEAD > review-input.diff
git ls-files --others --exclude-standard
```

第一条把暂存和未暂存的修改一起写进 `review-input.diff`；第二条只列出未跟踪文件，不把它们加进索引。哪些新文件该评审由你决定，不要为了“让 diff 看得见”就自动 `git add` 来源不明的文件。选定后把批准路径逐个追加进输入：

```bash
git diff --no-index -- /dev/null path/to/approved-new-file.ts >> review-input.diff
test -s review-input.diff && echo "input ready"
```

预期：`review-input.diff` 自己是未跟踪文件，不会被 `git diff HEAD` 再算进去；评审结束后删除。若评审的是已提交的分支，用 `git diff origin/main...HEAD > review-input.diff`（三点表示相对分叉点）。若 diff 很大，先按目录拆成几份，分别评审；把整仓库 diff 丢给一个子代理，输出通常又慢又泛。

## 第三步：调用并观察

在 Claude Code 会话中输入自然语言：

```text
使用 code-reviewer 子代理审查 review-input.diff。
只读，不修改文件；按它定义的格式输出，找不到问题时明确说明。
```

预期结果（示意）：会话中出现类似 `code-reviewer(...)` 的任务记录，`/tasks` 能查看状态；输出是一张按级别分组的发现列表，每条带 `文件:行号`。不同版本的展示方式可能不同，但“用了哪个代理、读了什么、输出了什么”应该可追溯。

如果刚创建 `.claude/agents/` 目录，重启会话最稳妥；已有代理文件的修改通常会被监听，但新目录不保证立即扫描。`/agents` 在当前一些版本里只打印管理提示，不提供完整列表；以文件是否存在和调试日志为准。

## 第四步：验收输出，而不是验收“它说完成了”

检查三件事：

1. **范围**：只引用了 `review-input.diff` 和其中提到的文件，没有跑去评审无关模块。
2. **证据**：每条发现都有具体位置和可核对的代码；没有“可能存在性能问题”这类无法定位的断言。
3. **只读**：`git status --short` 除了 `review-input.diff` 没有新增修改；没有出现被改写的源文件。

若输出没有发现，也可以接受，但要确认它确实读到了 diff，而不是因为文件路径错、读取失败而“空手而归”。可以让它复述 diff 中新增的函数名，作为读取成功的旁证。

## 第五步：看清隔离边界

`tools: Read, Grep, Glob` 意味着这个代理没有编辑和命令工具，但**不意味着它与主会话隔离**：默认情况下子代理与主会话共享工作目录和文件系统，能读到工作区中主会话可读的文件。它也不是内核沙箱，不能用来安全地执行不可信代码。

官方还提供 `isolation: worktree`，让子代理在临时 Git 工作树中工作，避免直接改主工作区；这仍是工作区隔离，不是安全边界。本文的评审员不需要它，因为本来就不写文件。若你以后让子代理改代码，先读 [Claude Code 权限](/articles/claude-code-permissions/)，不要把“独立 worktree”误解成“独立权限”。

另外，子代理只拿到自己的系统提示和基本环境，不自动继承主会话的全部对话。任务目标、输入路径、输出格式和禁止项要写清楚；不要指望它“记得”你刚才口头说过的约束。

## 常见失败与诊断

**1. 代理没有被识别。** 检查文件是否在 `.claude/agents/`、frontmatter 是否从第一行开始、`name` 和 `description` 是否存在。新目录需要重启会话；文件名不必与 `name` 完全一致，但保持一致更容易排查。用 `claude --debug` 看加载和解析信息。

**2. 某个 frontmatter 字段被忽略。** 较新版本的调试输出会提示某字段“不被识别或应用”。删除未知字段，只保留当前官方支持的键；不要因为字段没报错就假设它生效。

**3. 评审员试图修改文件或执行命令。** 检查 `tools` 是否真的只有 `Read, Grep, Glob`，以及是否被其他配置覆盖。权限规则和工具可用性是两层：工具不在列表里就不可用；即使有工具，deny 规则仍可阻止特定路径。发现越界时先停掉任务，不要继续让它“顺便修一下”。

**4. 输出全是泛泛而谈。** 输入可能太大，或 diff 文件没有被读到。缩小到单个目录，要求每条发现引用具体行；没有证据的条目直接退回。不要用“再多审几遍”代替明确的输入范围。

**5. 任务很慢或没有结束。** 子代理可能在做大范围搜索。把任务拆成“只看这个文件/这个目录”，或限制输出条数；不要用无上限的“审整个仓库”作为日常评审。

## 验收清单

- [ ] 代理文件位于 `.claude/agents/`，frontmatter 合法且只有必要字段。
- [ ] `tools` 不含 Write、Edit、Bash，评审过程没有改文件。
- [ ] 输入 diff 范围明确，输出每条发现都有文件与行号。
- [ ] 没有发现时，代理明确说明，而不是编造问题。
- [ ] 知道默认共享工作树，`isolation: worktree` 也不是安全隔离。
- [ ] 评审结束后删除了临时 diff，没有把它提交。

## 接下来

想把评审员嵌入日常流程，读 [Claude Code 代码评审](/articles/claude-code-review/)；需要调整它能读什么、不能读什么，读 [Claude Code 权限](/articles/claude-code-permissions/)。如果你还在建立基本的改动—验证节奏，先看 [Claude Code 工作流](/articles/claude-code-workflow/)。

## 参考来源

- [Claude Code 子代理](https://code.claude.com/docs/en/sub-agents)
- [Claude Code 权限](https://code.claude.com/docs/en/permissions)
- [Claude Code CLI 参考](https://code.claude.com/docs/en/cli-reference)

核验范围（2026-11-14）：代理文件位置、必需与常用 frontmatter 字段、工具限制和 `isolation: worktree` 的语义依据官方页面核对。`/agents` 的交互形式随版本变化；执行前用 `claude --debug` 和本机帮助确认。