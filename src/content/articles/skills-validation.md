---
title: "Skill 验证：格式、触发与内容三道闸门"
description: "Skill 的失败大多不是内容错，而是格式不合规范、触发条件太宽或太窄、跨客户端行为不一致。用格式校验、触发矩阵、内容演练三道闸门把它们提前暴露。"
category: skills
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 340
tags: ["Skills", "校验", "触发测试", "质量"]
featured: false
faq:
  - q: "Skill 验证要过哪三道闸门？"
    a: "先做格式校验，排除根本没加载；再用触发矩阵测正例与反例；最后用一次真实小任务演练，确认步骤、路径、授权和副作用都符合正文要求。"
  - q: "校验脚本报错却返回 0 怎么办？"
    a: "多半是写法吞掉了失败：echo 成功让脚本最后退出码变成 0。改成记录 fail 变量并在结尾按它退出，非法名称和空描述才能真正返回非零。"
  - q: "触发矩阵该怎么测才有效？"
    a: "准备 8 到 12 条提示，一半该触发、一半不该触发，每条都在新会话里跑，因为元数据不会热更新；记录是否触发、是否按步骤执行和失败原因。"
---

## 目标：把“感觉能用”变成可复现的验证

一个 Skill 有三种典型失效方式，症状完全不同：

1. **加载失败**：目录名与 `name` 不一致、字段超长、YAML 写坏——工具直接忽略它，你却在原地找触发问题；
2. **触发错误**：该用时不用，不该用时乱用，或者描述太宽导致每次都加载；
3. **执行偏差**：触发了，但漏步骤、用错脚本、越权改文件。

三道闸门分别对应这三类。每道都有可执行的检查，不依赖主观判断。

## 前置条件

- 一个已写好的 Skill 目录（参见 [/articles/skills-design/](/articles/skills-design/)）
- 目标客户端的 CLI 可用，能新开会话或 `/skills` 查看列表
- 能改一个隔离的测试仓库（不要在真实项目上试触发）

## 闸门一：格式校验，先排除“根本没加载”

规范里可机器校验的规则不多，但每一条都致命：

- `name` 与父目录名一致；
- `name` 只含 `a-z0-9-`，不以 `-` 开头或结尾，无 `--`，长度 1–64；
- `description` 非空、≤1024 字符；
- frontmatter 必须从文件第一行 `---` 开始（Claude Code 的规则：只有首行的 `---` 才被识别，YAML 写坏时 Skill 仍会加载但字段全空）。

一个不依赖额外依赖的检查脚本（注意 `fail` 变量和最后的 `exit $fail`，否则脚本会“报了错但返回 0”）：

```bash
#!/usr/bin/env bash
# scripts/check-skill.sh <skill-dir>
set -uo pipefail
dir="${1:?usage: check-skill.sh <skill-dir>}"
file="$dir/SKILL.md"
fail=0
bad() { echo "FAIL $*"; fail=1; }

[ -f "$file" ] || { echo "MISSING $file"; exit 1; }
[ "$(head -n1 "$file")" = "---" ] || bad "frontmatter must start at line 1"

name=$(awk '/^---$/{n++; next} n==1 && /^name:/{sub(/^name:[ ]*/,""); print; exit}' "$file")
desc=$(awk '/^---$/{n++; next} n==1 && /^description:/{sub(/^description:[ ]*/,""); print; exit}' "$file")
base=$(basename "$dir")

[[ "$name" == "$base" ]] || bad "name($name) != dir($base)"
[[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || bad "name charset: '$name'"
(( ${#name} <= 64 )) || bad "name > 64 chars"
[[ -n "$desc" ]] || bad "description empty"
(( ${#desc} <= 1024 )) || bad "description > 1024 chars"

echo "checked: $dir (fail=$fail)"
exit $fail
```

为什么不能用 `[[ 条件 ]] || echo "FAIL ..."` 就完事：`||` 后面的 `echo` 会成功，把前一条命令的失败吞掉，`set -e` 也不会救你——脚本最后一条命令是 `echo`，退出码就是 0。用四份用例实测过：`name: My_Skill` 且 `description` 为空时，旧写法打印了 `FAIL name charset` / `FAIL description empty` 却返回 **0**；目录叫 `wrong-dir`、`name` 写 `good-skill` 时，旧写法只打一行 `WARN` 就放行。新写法这两种不一致/非法情形都是 `exit 1`，合法 skill（`name: good-skill`、有描述、目录同名）返回 0，目录不存在返回 1。

目录名与 `name` 不一致为什么算错误而不是警告：客户端、上传包和调用侧都是按**目录（包）名**定位 skill 的，两者不一致时，你本地测通了、分发到别人机器上可能找不到或装两份。修复方式只有两种：改目录名，或改 `name`；不要用“反正是警告”绕过。

这只是最低门槛。**额外字段是否被接受，取决于目标客户端**：claude.ai 上传或 Skills API 只允许 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools`，出现 `argument-hint` 之类会直接报错。要跨端复用，就把扩展字段拆到各端自己的副本里。

## 闸门二：触发矩阵，正例反例都要测

准备 8–12 条提示，一半该触发、一半不该触发。每条都在**新会话**里跑，因为元数据是启动时载入的。

| 类型 | 示例提示 | 期望 |
| --- | --- | --- |
| 正例（明确） | 用 release-notes 整理 v1.4.0 的发布说明 | 触发 |
| 正例（自然语言） | 把这次迭代的合并记录写成更新日志 | 触发 |
| 正例（间接） | 这版改了哪些面向用户的内容？ | 触发或明确说明不适用 |
| 反例（相邻领域） | 帮我写一条 commit message | 不触发 |
| 反例（无关） | 修复登录页样式 | 不触发 |
| 边界（信息不足） | 写发布说明 | 触发并追问版本范围 |

记录三列：是否触发、是否按步骤执行、失败原因。三条以上正例不触发，就是 `description` 的触发语不够具体；反例频繁误触发，说明描述过宽，需要加排除条件。

一个可复用的判定：**如果把 `description` 给你同事看，他能否在 5 秒内判断“这个任务该不该用它”？** 不能，就是描述没写清。

## 闸门三：内容演练，验证步骤真的可执行

触发正确不代表执行正确。用一次真实小任务走完整流程，重点看四件事：

1. **脚本路径**：正文里写的 `scripts/collect-diff.sh`，在 Skill 被加载时相对路径基准是否正确（不同客户端基准不同，用明确的相对目录或环境变量更安全）；
2. **工具授权**：`allowed-tools` 写的工具是否真的免询问，以及它在下一轮是否失效（Claude Code 中该授权在发下一条消息后清除）；
3. **副作用边界**：正文说“只输出文本”，实际有没有偷偷改文件——用 `git status` 检查；
4. **失败路径**：故意让脚本返回错误，看它是否按正文要求停下并报告，而不是自由发挥。

演练时把 `references/` 的读取也覆盖到：正文若写“遇到破坏性变更时读 references/migration.md”，就构造一个破坏性变更，确认它真的去读。

## 版本与可移植性检查

- 固定依赖版本：Skill 里引用的脚本不要用 `@latest`；
- 记录它在哪些客户端验证过、版本号是多少，写进 Skill 目录的 README 或 `metadata`；
- 用 `compatibility` 字段声明环境要求（≤500 字符），而不是在正文里写“需要 Node”；
- 只使用规范字段的版本，至少在一个非原生客户端里试一次——前面说的“格式相同、行为不同”只有实测才发现。

## 验收标准

1. 格式脚本零 FAIL；跨端使用的副本零非法字段；
2. 触发矩阵：正例命中率 ≥ 80%，反例误触发 ≤ 1 条，且每条失败都有归因；
3. 一次完整演练产出了预期产物，`git status` 无越界改动；
4. 故意注入的脚本错误被正确上报，Skill 没有“绕过失败继续执行”；
5. 记录里有验证日期、客户端名称与版本——没有版本信息的“已验证”等于没验证。

## 常见错误

- **只测正例。** 不测反例，就不知道它的边界在哪，最后变成“什么任务都往里套”。
- **在旧会话里测触发。** 元数据不会热更新，结论无效。
- **把格式错误当触发问题查。** 先跑闸门一，省掉一半排查时间。
- **相信 `allowed-tools` 永久生效。** 它通常是回合级的，且可能被组织策略覆盖。
- **在一个客户端通过就宣布可移植。** 加载位置、字段白名单、触发方式都可能不同。

Skill 稳定后，把它接进自动化时要注意人工检查点：[/articles/automation-checkpoints/](/articles/automation-checkpoints/)。设计层面的取舍回到 [/articles/skills-design/](/articles/skills-design/)。

## 参考来源

- Agent Skills 规范（字段约束、渐进式加载）：<https://agentskills.io/specification>
- Claude Skills 作者最佳实践（name/description 限制）：<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Claude Code Skills（frontmatter 识别规则、字段白名单、`allowed-tools` 有效期）：<https://code.claude.com/docs/en/skills>
- Codex Skills 作者指南（`SKILL.md`、渐进加载、`$skill-creator`）：<https://learn.chatgpt.com/docs/build-skills>
- 本文校验脚本为示例实现，纯 bash + awk，未在 CI 中实测
