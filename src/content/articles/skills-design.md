---
title: "Agent Skill 设计：什么该写成 Skill，什么不该"
description: "Skill 不是提示词收藏夹。讲清它和项目规则、MCP 工具、斜杠命令的分工，怎么写可被正确触发的 description，以及为什么同一个 Skill 在不同工具里表现并不一致。"
category: skills
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 320
tags: ["Skills", "SKILL.md", "上下文工程", "可移植性"]
featured: true
faq:
  - q: "什么流程值得写成 Skill？"
    a: "重复三次以上、只在某类任务里需要的一整套步骤才值得。每次都要遵守的约束归项目规则，需要真正执行的外部能力归 MCP 工具，三者不要混用。"
  - q: "description 该怎么写？"
    a: "同时写清做什么和什么时候用，并把用户真会说的触发语放进去，例如 release notes、changelog、发布说明。只写帮助处理发布任务很难被触发。"
  - q: "同一个 Skill 换客户端还能用吗？"
    a: "格式相同不等于行为相同。规范只定义目录结构与字段，存放位置、加载和触发由各客户端决定；想跨端复用就只用规范字段，工具专属能力留在适配层。"
---

## 目标：把重复流程做成“按需加载的资产”

把一个多步骤流程反复粘贴进对话，是这个需求出现的信号。但直接做成 Skill 常常失败：要么模型从不触发它，要么触发了却漏掉关键步骤，要么换个工具就完全不能用。

本文解决三件事：**判断该不该做 Skill**、**写一个能被正确触发的 Skill**、**认清它的可移植性边界**。

## 前置条件

- 有一段你重复了三次以上的操作流程
- 知道它在哪个工具里运行（Claude Code、Codex 或其他），以及该工具如何发现 Skill
- 能接受“Skill 是文档，不是代码保证”

## 先分工：四种载体不要混用

| 载体 | 适合放什么 | 加载方式 |
| --- | --- | --- |
| 项目规则（`CLAUDE.md` / `AGENTS.md`） | 每次都要遵守的约束：测试命令、目录禁区、代码风格 | 每次会话常驻 |
| Skill | 只在特定任务里需要的一整套步骤与参考材料 | 元数据常驻，正文按需加载 |
| MCP 工具 | 需要真正执行的外部能力：查库、调 API、读浏览器 | 作为工具暴露给模型 |
| 斜杠命令 | 你希望手动触发的固定动作 | 显式调用 |

判断口诀：**“每次都要遵守”归规则；“某类任务才需要的方法”归 Skill；“需要真正执行的能力”归工具。**

一个流程如果只是三段提示词，且你希望每次都生效，那它属于规则，不该做成 Skill——多一层按需加载只会增加不触发的风险。

## 结构：元数据小，正文短，材料外置

Agent Skills 规范定义的结构很克制：

```text
code-review/
├── SKILL.md          # 必需：元数据 + 指令
├── references/
│   └── checklist.md  # 需要时才读
└── scripts/
    └── collect-diff.sh
```

加载是渐进的：`name` 和 `description` 常驻（约百 token 量级），正文在被激活时整体载入（建议 5000 token 以内），`references/`、`scripts/`、`assets/` 只在需要时才取。规范明确建议 `SKILL.md` 控制在 500 行以内。

这带来一条设计纪律：**SKILL.md 只写“怎么走这条路”，不写“所有相关知识”。** 长清单、字段表、示例库放 `references/`，并在正文里写清“什么时候去读哪个文件”。

## 元数据：规范要求 vs 各工具扩展

规范对两个字段有硬约束：

- `name`：1–64 字符，只能小写字母、数字、连字符，不能以连字符开头或结尾，不能有连续连字符，且必须与父目录名一致；
- `description`：1–1024 字符，非空，要同时说明“做什么”和“什么时候用”。

可选字段有 `license`、`compatibility`（≤500 字符）、`metadata`，以及标记为实验性的 `allowed-tools`。

```yaml
---
name: release-notes
description: 把一段时间内的合并记录整理成发布说明。当用户要求写 release notes、changelog 条目，或要把一批 PR 归纳成面向用户的更新时使用。
---
```

`description` 是触发质量的关键。写“帮助处理发布相关任务”几乎不会被触发；写清触发语（release notes、changelog、发布说明）和任务边界，命中率会明显不同。

## 正文：写成可执行的步骤，不写形容词

```markdown
## 何时使用
用户要求整理发布说明，且仓库有 git 历史。

## 步骤
1. 运行 `scripts/collect-diff.sh <from> <to>`，得到合并记录。
2. 按「新功能 / 修复 / 破坏性变更」三类归并，丢弃纯依赖升级。
3. 每条不超过 80 字，面向使用者描述影响，不写实现细节。
4. 破坏性变更必须给出迁移做法，没有则标注「待确认」。
5. 输出 Markdown，标题为版本号。

## 不要做
- 不要编造没有出现在记录里的条目
- 不要修改 CHANGELOG.md，只输出文本
```

反面写法是“请专业、准确、简洁地总结”——这些词无法验收。**每条步骤都应该能被检查是否完成。**

## 可移植性：格式相同 ≠ 行为相同

这是最容易踩的坑。规范只定义“目录里放什么”，**不定义存放在哪、如何加载、如何触发**——这些由各工具自己决定。事实差异很明显：

- **Claude Code** 支持大量扩展字段：`when_to_use`、`argument-hint`、`allowed-tools`、`context: fork`、`hooks`、`paths` 等；`allowed-tools` 的免询问授权在发下一条消息后就失效。
- **claude.ai 上传或 Skills API** 只接受 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools`；出现其他字段会直接报错：`Unexpected key(s) in SKILL.md frontmatter: argument-hint.`。
- **Codex** 已把 Skills 作为正式的可复用工作流作者格式写进官方文档：一个 Skill 是一个目录，必须包含 `SKILL.md`，frontmatter 至少写 `name` 与 `description`，正文和可选的 `scripts/`、`references/`、`assets/` 一起按需加载。Codex 先拿到每个 Skill 的名称、描述与文件路径，再决定是否把整份 `SKILL.md` 载入上下文；放在 `~/.codex/skills` 的 Skill 对所有仓库可用，放在仓库里的可以提交给团队共享。调用既支持模型隐式选择，也支持 `$skill-name` 显式指定，创建可用内置的 `$skill-creator`。
- **注意旧资料的时效性**：OpenAI 早期仓库文档曾把 Skills 整体标注为实验性，那份快照已被当前的 Build skills 与 Plugin Skills 文档取代。判断当前能力要看现行文档，不要引用几年不更新的片段。
- **加载位置也不同**：Claude Code 有企业 / 个人 / 项目 / 插件等分层与优先级，其他工具各有自己的目录约定。

所以：**想跨工具复用，就只写规范内的字段，把工具专属能力留在各自的适配层。** 需要 `allowed-tools` 这类实验字段时，先确认目标工具是否支持，不要假设“大家都一样”。

## 验收标准

1. 新会话里用一句自然语言提出该任务，Skill 被自动触发；用无关任务测试时不被触发；
2. `SKILL.md` 少于 500 行，长材料在 `references/` 且正文指明了读取条件；
3. `name` 与目录名一致，只含小写字母数字连字符，长度 ≤64；`description` ≤1024 且包含触发语；
4. 只使用规范字段的版本能在至少两个客户端里通过格式校验；
5. 正文步骤可逐条判断“是否完成”，没有“专业、准确、简洁”这类不可验收描述。

## 常见错误

- **把项目规则塞进 Skill。** 不触发就等于没有，规则该常驻。
- **description 写成一堆关键词**。没有“何时使用”的语境，模型难以判断边界。
- **正文塞满参考资料。** 每次激活都吃掉数千 token，反而挤掉任务本身。
- **用 `allowed-tools` 图省事。** 它通常只在当前回合有效，且被组织策略覆盖时不会生效。
- **假设 Skill 在所有工具里行为一致。** 见上文，格式是共同的，加载与权限不是。

写完之后必须验证它是否真的按预期触发，方法见 [/articles/skills-validation/](/articles/skills-validation/)。Skill 和工具的分界，可以参考 [/articles/mcp-boundaries/](/articles/mcp-boundaries/)。

## 参考来源

- Agent Skills 规范（必需/可选字段、目录结构、渐进式加载）：<https://agentskills.io/specification>
- Claude Code Skills（位置、优先级、扩展字段、`allowed-tools` 有效期）：<https://code.claude.com/docs/en/skills>
- claude.ai / Skills API 允许的字段子集：同上文档“Outside Claude Code”一节
- Codex Skills 作者指南（`SKILL.md` 结构、渐进加载、`~/.codex/skills`、`$skill-creator`）：<https://learn.chatgpt.com/docs/build-skills>
- OpenAI Plugin Skills 概念（Skill 由名称、描述、指令与可选资源组成）：<https://developers.openai.com/plugins/concepts/skills>
