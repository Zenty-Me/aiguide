---
title: "第一个 Agent Skill：写一份可被发现的 change-summary"
description: "从目录、frontmatter 到完整 SKILL.md，一步步创建 change-summary，并用 Claude Code 的发现路径做手工验收。"
category: "skills"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "入门"
order: 310
tags: ["Agent Skills", "SKILL.md", "Claude Code"]
featured: false
faq:
  - q: "第一个 Skill 该放在哪个目录？"
    a: "项目级放仓库根的 .claude/skills/名字/SKILL.md，个人级放主目录中的 .claude/skills；项目级能提交到仓库共享，换客户端要按对方文档放置。"
  - q: "斜杠命令提示不存在怎么办？"
    a: "先查项目根目录、Skill 的放置层级、目录名与 name 是否完全一致；放在个人级却按项目级命令查找，同样会提示不存在。"
  - q: "做这个 Skill 必须先装 Node 吗？"
    a: "最小版本不依赖 Node，只用 Git 和一个支持 Agent Skills 的客户端。带脚本的后续版本才需要 Node 20 以上，脚本只读文件，不执行 Git 写操作。"
---

Agent Skill 不是一段“更长的提示词”，而是一个带元数据的目录：客户端先读名称和描述判断是否相关，命中后才加载正文。第一个 Skill 最容易犯的错，是一上来写几千字规范，却没有让客户端知道“什么时候该用它”。本文用 `change-summary` 做一个最小可用版本，只依赖 Git，不引入脚本；资源拆分留到下一篇。

## 前置条件

- 一个 Git 仓库，最好有 `main` 分支和一段可比较的改动。
- 支持 Agent Skills 的客户端。本文以 Claude Code 为例，使用它官方文档中的项目路径 `.claude/skills/<name>/SKILL.md`。
- Node.js 不是这个最小版本的硬依赖；下一篇文章的脚本会用到 Node 20+。
- 先读 [Agent Skills 设计](/articles/skills-design/)，了解正文与资源的分工；完成后继续看 [Skill 验证](/articles/skills-validation/) 与 [资源拆分](/articles/skills-resources/)。

## 规范与客户端位置不是一回事

Agent Skills 规范规定的是目录结构、`SKILL.md` 的 frontmatter 和加载语义，**不规定**客户端必须把 Skill 放在哪个绝对路径。Claude Code 的项目级位置是 `.claude/skills/<skill-name>/SKILL.md`，个人级位置是 `~/.claude/skills/<skill-name>/SKILL.md`；项目级目录可以提交到仓库，和队友共享。换到别的客户端，要按那个客户端的文档放置，不能把 `.claude` 当成协议的一部分。

本文选择项目级路径，因为它可版本控制、可审查，也方便在仓库里做验收。

## 第 1 步：让名称和目录一致

创建目录：

```text
.claude/skills/change-summary/
└── SKILL.md
```

`name` 必须是 1–64 个字符，只含小写字母、数字和连字符，不能以连字符开头或结尾，也不能连续出现连字符；它还必须和父目录名完全一致。`change-summary` 满足这些条件，`Change_Summary` 或 `change summary` 不行。目录名就是 Claude Code 里的命令名，所以最终可以直接输入 `/change-summary`。

## 第 2 步：把触发条件写进 description

`description` 是 1–1024 字符，既要说明“做什么”，也要说明“什么时候用”。只写“帮助总结改动”太宽，模型可能在任何文本任务里加载它；只写“生成 PR 描述”又漏掉了 release note 场景。本文使用：

```text
Summarize a Git diff into user-visible changes, verification evidence, and risks.
Use when the user asks for a change summary, PR description, or release note.
```

这段描述包含三个触发词：change summary、PR description、release note。它没有承诺运行测试，也没有声称能理解业务影响；这些边界会在正文里再次强调。

## 第 3 步：写完整的 SKILL.md

下面是可以直接保存的完整文件。正文只放流程、输出格式和边界，不放大段参考资料：

```markdown
---
name: change-summary
description: Summarize a Git diff into user-visible changes, verification evidence, and risks. Use when the user asks for a change summary, PR description, or release note.
license: MIT
metadata:
  version: "0.1.0"
---

# Change summary

## Procedure

1. Confirm the base and head revisions. If either is unknown, ask; do not guess.
2. Run `git diff --stat <base>...<head>` and `git diff <base>...<head>`.
3. Read the changed hunks. Group them by user-visible behavior, not by file.
4. Call out migrations, lockfiles, CI changes, and sensitive path names.
5. Separate "verified by this run" from "not verified". If no test ran, say so.

## Output

- What changed, in user-visible terms
- Files and boundaries touched
- Verification: command and result, or "not run"
- Risks, rollback notes, and follow-ups

## Boundaries

- Read-only: do not commit, push, deploy, or rewrite history.
- Do not claim a test passed because a test file changed.
- Never copy credentials, tokens, private keys, or customer data into the summary.
- If the diff is too large, summarize the file groups first and ask which area to inspect.
```

正文在 Skill 激活时整体加载，所以控制在 500 行、约 5000 tokens 以内是合理目标。这个文件远低于上限，也不需要额外资源。

## 第 4 步：选择发现路径并手工验收

把文件放到项目根目录的 `.claude/skills/change-summary/SKILL.md`，从仓库根目录启动一个新的 Claude Code 会话。先显式调用：

```text
/change-summary
```

如果命令不存在，先检查三件事：当前项目根目录是否正确、路径是否是 `.claude/skills/change-summary/SKILL.md`、目录名与 `name` 是否完全一致。然后再测试自动触发：输入“总结当前分支相对 main 的改动”，观察它是否加载该 Skill、是否先确认 base/head、是否只陈述 diff 中的事实。

本环境没有调用模型，因此**不宣称自动触发已实测**；上面是可执行的人工验收步骤。验收时重点看三件事：它有没有在 base 不明确时追问；有没有把“测试文件改了”说成“测试通过”；有没有把 token 或客户数据抄进摘要。

## 验收标准

- `name` 与父目录一致，字符集和长度符合规范。
- `description` 同时包含动作和触发场景，能区分“总结改动”和“翻译文本”。
- 正文只包含流程、输出和边界，没有无法验证的承诺。
- 显式 `/change-summary` 可调用；自动触发在目标客户端中按预期工作。
- 输出区分“已验证”和“未验证”，不编造测试结果。
- 不包含绝对家目录、密钥或具体客户的私有数据。

## 常见错误与诊断

- **`/change-summary` 不存在**：最常见是放到了用户级路径却用项目级命令查找，或目录名写成 `change_summary`。先确认客户端、路径层级和名称三者一致。
- **Skill 被加载，但从不自动触发**：`description` 太抽象，缺少用户实际会说的词；把 “change summary / PR description / release note” 写进去，而不是只写“帮助开发”。
- **翻译任务也触发它**：描述过宽，或正文声称能处理任意文本；收紧到 Git diff 和变更总结，并在边界里写“不用于翻译”。
- **正文越写越长**：把检查清单、模板、脚本都塞进 `SKILL.md`，导致每次激活都加载；下一篇会把它们拆到 `references/`、`assets/` 和 `scripts/`。
- **把客户端路径当成规范**：在非 Claude 客户端里照搬 `.claude/skills`，然后判断“Skill 规范不兼容”；规范只定义目录和元数据，安装位置要看客户端文档。

## 参考来源

- Agent Skills Specification：https://agentskills.io/specification
- Claude Code Skills（发现路径、`/skill-name` 调用）：https://code.claude.com/docs/en/skills

官方资料核对日期：2026-11-14。本文的 Skill 文件为本地编写示例，未在 Claude Code 中调用模型验证自动触发。