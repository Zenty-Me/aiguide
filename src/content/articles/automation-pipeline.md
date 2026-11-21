---
title: "Agent 自动化流水线：接入 CI 的四个环节"
description: "一条能上生产的自动化流水线不是“一键全自动”，而是触发、准备、执行、复盘的串联。给出可复现的流水线骨架、失败预算、幂等要求与成本控制。"
category: automation
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 520
tags: ["自动化", "CI", "Agent", "流水线"]
featured: false
faq:
  - q: "Agent 流水线分哪四个环节？"
    a: "触发、准备、执行、复盘，顺序不要调换。触发要区分事件与意图并定好幂等键，准备阶段固定环境、上下文和凭据，执行时限制超时、工具与轮次，复盘用状态判定结果而非模型自述。"
  - q: "--allowedTools 是限制清单吗？"
    a: "不是。它是免询问白名单，列出的工具调用不再逐次批准；要真正收窄可用工具得用 --tools。两者名字相近、作用相反，是流水线事故的常见来源。超时、工具和轮次三项约束缺一不可。"
  - q: "能交给流水线自动发布吗？"
    a: "不适合。会直接改动主分支、发布或对外发消息的动作应由人触发，自动化最多生成待审产物。值得自动触发的是定时扫描、新的 issue 和 PR 评论指令这类事项。"
---

## 目标：让 Agent 在无人盯着的情况下也不失控

本地跑 Agent 时，你是最后一道防线；放进流水线后，这道防线没了。所以自动化要补三样东西：**明确的触发条件**、**受限的执行环境**、**可判定的结束状态**。

本文给出一条最小但完整的骨架，并逐个说明每个环节的失败模式。

## 前置条件

- 能运行 Agent 的非交互模式（如 `codex exec`、`claude -p`）
- 有一个 CI 或定时任务可用的执行环境
- 有测试套件或至少一组可判定的检查命令

## 四个环节

```text
触发 ─→ 准备（环境、上下文、凭据）─→ 执行（Agent + 工具）─→ 复盘（产物、日志、成本）
         ↑                                    │
         └──────── 不通过则中止 ←──────────────┘
```

**顺序不能换**。常见错误是先接触发，最后才考虑验证，结果第一次自动运行就产生无法回滚的改动。

## 环节一：触发——区分“事件”与“意图”

值得自动触发的事项很少：

- 定时任务：每晚跑依赖安全扫描、生成变更摘要；
- 事件：新的 issue、PR 上的评论指令（如 `@bot fix-tests`）；
- 手动：人在需要时点一下，仍然全程自动执行。

不值得自动触发的：任何会直接改动主分支、发布、发送外部消息的动作。这些应该由人触发，或者只生成待审产物。

触发阶段就要确定**幂等键**：同一个 issue 被重复触发时，不应产生两份分支。用 issue 编号或 PR 编号作为键。

## 环节二：准备——把不确定性挡在门外

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 干净的基线：不从脏工作区开始
git fetch --depth=1 origin "$BASE_REF"
git worktree add --detach /tmp/run "$BASE_REF"

# 2. 固定工具版本，不追 latest
#    （示例：把版本写进仓库锁文件，而不是流水线里临时安装）
test -f package-lock.json || { echo "missing lockfile"; exit 1; }

# 3. 凭据只给必要作用域，且只在本次运行有效
: "${REPO_TOKEN:?REPO_TOKEN is required}"

# 4. 预算：超时就杀，不等它自己结束
export AGENT_TIMEOUT_SECONDS=900
```

要点：

- **不要复用带凭据的长期工作区**。每次运行用独立 worktree 或容器，结束即销毁。
- **凭据最小化**：只读 token 做分析，写 token 只用于创建分支，不用于合并。
- **依赖必须锁定**。`@latest` 会让同一份配置在两天里跑出两种行为。

## 环节三：执行——把 Agent 当成不可信的步骤

非交互模式的关键参数：限制最大轮次、限制可用工具、规定输出格式。

```bash
timeout "${AGENT_TIMEOUT_SECONDS}" \
  claude -p "修复 /tmp/run 中失败的单元测试。只改测试断言，不改实现。" \
  --allowedTools "Read" "Edit" "Bash(npm test:*)" \
  --output-format json \
  --max-turns 20 \
  > result.json || echo "agent step failed" >> run.log
```

三个约束缺一不可：

1. **超时**：`timeout` 包住整个进程，而不是相信 Agent 自己会停；
2. **工具白名单**：只给完成任务所需的工具，不要 `Bash` 全开；
3. **轮次上限**：`--max-turns` 只对 print 模式有效，交互模式不适用。

注意 `--allowedTools` 的语义是**免询问白名单**，不是限制清单。要真正收窄可用工具，得用 `--tools`（Claude Code 的另一组参数）。两个参数名字相近、作用相反，是流水线事故的常见来源。

如果使用 Codex，对应的是 `codex exec`，它默认在非交互下运行，`--ephemeral` 可以不落盘 rollout 文件。具体 flag 以你安装版本的 `codex exec --help` 为准——不同版本参数有差异。

## 环节四：复盘——用状态判定，不用文字判定

Agent 说“已修复”不算通过。判定顺序：

```bash
cd /tmp/run
git diff --stat                      # 有没有改动，改动范围是否符合预期
npm test -- --reporter=dot           # 真实结果，不是模型自述
git status --porcelain               # 有没有越界创建文件
```

然后做一次**范围检查**：允许改动的路径之外出现 diff，直接判定失败。这比读日志可靠得多。

成本与日志：

- 记录输入/输出 token、耗时、工具调用次数；
- 保留 Agent 的完整轨迹（`--output-format json`），出问题时才有复盘材料；
- 失败时保留 worktree 供人工检查，成功时立即删除。

## 验收标准

1. 连跑两次同一触发，第二次不会产生重复分支或重复提交；
2. 断网或凭据失效时，流水线在准备阶段就失败，而不是让 Agent 空转；
3. 故意让测试失败，流水线以非零退出，且失败日志里能看到改动的 diff；
4. Agent 试图修改允许范围外的文件时，运行被判定失败；
5. 单次运行有明确的时间上限与轮次上限，超时能自动终止。

## 常见错误

- **在 Agent 之后才跑测试**。应该把测试作为判定闸门，通过才进入下一步。
- **信任自然语言结论**。只看“我已完成”是最常见的假成功来源。
- **复用带凭据的长生命周期 runner**。一次越权就是长期风险。
- **没有幂等键**。重复触发导致分支名冲突或重复评论。
- **不设成本上限**。循环重试会在无人察觉时放大调用量。

自动化到哪一步必须停下来等人，是下一节的主题：[/articles/automation-checkpoints/](/articles/automation-checkpoints/)。工具权限的边界见 [/articles/mcp-boundaries/](/articles/mcp-boundaries/)，Agent 循环本身的设计见 [/articles/agent-tool-loop/](/articles/agent-tool-loop/)。

## 参考来源

- Claude Code CLI 参考（`-p`、`--output-format`、`--allowedTools`、`--max-turns`）：<https://code.claude.com/docs/en/cli-reference>
- Claude Code 权限模式与工具策略：<https://code.claude.com/docs/en/permissions>
- Codex 非交互执行（`codex exec`、`--ephemeral`）：openai/codex 仓库 README 与 `codex-rs/exec` 说明
- Anthropic《Building effective agents》（工作流与 Agent 的边界）：<https://www.anthropic.com/engineering/building-effective-agents>
- 本文示例为说明性骨架，参数需按你安装的 CLI 版本核对，未在 CI 中实测
