---
title: "Claude Code 日常流程：/init、plan 模式与一次干净的提交"
description: "把 Claude Code 用成稳定工具而不是抽奖：先用 /init 建立项目记忆，用 plan 模式先看方案，按权限模式逐级放权，最后用 diff 和自己的一条验证命令收尾。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 130
tags: ["Claude Code", "工作流", "权限模式", "CLAUDE.md"]
featured: true
---

## 目标：把“对话式改代码”变成可重复的流程

Claude Code 的能力上限很高，踩坑也集中：一次性放开权限、不给项目记忆、让它自由发挥，最后得到一堆看不出意图的改动。

本文建立一个固定节奏：**建记忆 → 出计划 → 小步改 → 自查 → 提交**。每一步都有明确的产出物，你在任何一步都能停下来。

## 前置条件

- 已安装并登录 Claude Code，终端执行 `claude` 能进入交互界面
- 一个 git 仓库，工作区干净（`git status` 无未提交改动）
- 知道本项目的测试命令和构建命令

## 步骤一：用 /init 建立项目记忆

```text
/init
```

`/init` 会在项目里生成 `CLAUDE.md`，用于记录构建命令、代码约定、目录结构这类“每次都要用到”的信息。它是项目记忆，不是任务清单。

生成后**必须人工读一遍并删改**：模型总结出来的命令经常差一点（写成 `npm test` 而实际是 `pnpm test`），错误的记忆比没有记忆危害更大。保留三类内容即可：

```markdown
# 项目说明
- 包管理器：pnpm（不要用 npm install 生成 package-lock.json）
- 测试：pnpm test；单文件：pnpm vitest run src/x.test.ts
- 类型检查：pnpm tsc --noEmit

# 约定
- 组件文件使用 PascalCase，工具函数使用 camelCase
- 不引入新的日期库，统一用 Intl API

# 边界
- 不修改 prisma/migrations/**
- 提交前必须通过 pnpm test 与 pnpm tsc --noEmit
```

## 步骤二：习惯先进 plan 模式

计划模式的行为是：读文件、跑只读命令做调研、写方案，但不改你的源码，等你批准后才动手。

```bash
claude --permission-mode plan
```

进入后直接说任务：

```text
目标：给 /api/orders 增加按状态过滤的能力。
请先调研现有的路由、查询层和测试，输出：
1) 需要改哪些文件，各自改什么；
2) 接口参数与返回结构的变更点；
3) 会破坏哪些现有调用方；
4) 验证方式。
先不要改代码。
```

方案里最值钱的是第 3 条：**破坏性影响**。如果它说不出谁在调用这个接口，说明调研不充分，先让它补充再批准。

在会话中也可以随时用 `/plan` 前缀进入计划模式，或用 `Shift+Tab` 在 `default` → `acceptEdits` → `plan` 之间循环。

## 步骤三：按任务风险逐级放权

权限模式决定“什么操作不需要问你”。常用的四档：

| 模式 | 不问就执行的操作 | 适用场景 |
| --- | --- | --- |
| `default` | 只读 | 陌生仓库、敏感模块 |
| `plan` | 只读 + 写方案 | 需求不清、影响面大 |
| `acceptEdits` | 读、工作区内编辑、常见文件操作 | 自己熟悉的小范围迭代 |
| `dontAsk` | 只读 + 已预批准的工具，其余直接拒绝 | CI、无人值守脚本 |

`bypassPermissions`（等价 `--dangerously-skip-permissions`）会跳过包括 `.git` 在内的写入确认，官方明确要求只在容器、虚拟机这类隔离环境使用。日常开发不要开。

按需收窄比一次性放开更实用：

```bash
claude --permission-mode acceptEdits \
  --allowedTools "Bash(git diff *)" "Bash(git status)" "Bash(pnpm test *)"
```

注意 `--allowedTools` 里写的是**免询问**的白名单，不是“只能使用这些工具”；要限制可用工具集合，应该用 `--tools`。

## 步骤四：小步改，每步自查

一个可接受的循环是：改一处 → 跑测试 → 看 diff → 继续。别让它连续改十个文件再一起看。

```bash
git diff --stat          # 先看范围
git diff                 # 再看内容
pnpm test                # 最后看结果
```

如果 diff 开始超出你的阅读能力，停下来，让它回退并拆小。这一步的纪律比任何提示词技巧都重要。

## 步骤五：提交前的一次真实验证

让它总结改了什么，然后**你自己跑一遍验证命令**。`/context` 可以查看当前上下文占用，长会话里如果它开始忘记前面的约束，用 `/context` 确认是否已被压缩，必要时开新会话并带上结论。

提交信息让它起草，但你要核对是否描述了真实改动：

```text
根据 git diff 起草一条提交信息，遵循 Conventional Commits，
只描述实际发生的改动，不要写未做的部分。
```

## 验收标准

1. `CLAUDE.md` 里的每条命令你都亲手跑过，没有一条是模型编的；
2. 改动前存在一份你批准过的计划，且计划里写明了受影响的调用方；
3. 权限模式与任务风险匹配，没有使用 `bypassPermissions`；
4. 提交前 `git diff` 全部读过，测试与类型检查的实际输出贴在你的记录里。

## 常见错误

- **把 `/init` 的产物直接提交。** 里面常有不存在的脚本名和过期目录。
- **在 plan 模式下以为它不会动手。** 它仍会跑只读命令做调研，只是在批准前不改源码；反过来说，批准前别在同一个仓库里干别的写操作。
- **用 `acceptEdits` 跑陌生仓库。** 编辑免确认意味着它可以在工作区任意写文件。
- **长会话硬撑。** 上下文被压缩后约束会变模糊，主动收尾比反复纠正便宜。
- **只让它自测。** 它写的测试可能顺着自己的实现来，关键路径要有你独立写的断言。

下一步是把评审也纳入流程：[/articles/claude-code-review/](/articles/claude-code-review/)。如果你更关心长期把规则固化成资产，看 [/articles/skills-design/](/articles/skills-design/)。

## 参考来源

- 快速开始与常用命令：<https://docs.claude.com/en/docs/claude-code/quickstart>
- 权限模式：<https://code.claude.com/docs/en/permission-modes>
- CLI 参数参考：<https://code.claude.com/docs/en/cli-reference.md>
- 内置命令：<https://code.claude.com/docs/en/commands.md>
