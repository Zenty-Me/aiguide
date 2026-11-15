---
title: "Claude Code 代码评审：用 /review 和 hooks 做成独立工序"
description: "用 /review、/security-review 和无头模式把评审做成一道独立工序：限定输入范围、要求可定位的问题、用 hook 拦住危险动作，最后人工裁决。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 160
tags: ["Claude Code", "代码评审", "Hooks", "CI"]
featured: false
---

## 目标：把评审变成有输入、有输出格式、有裁决人的工序

让模型“看一下这段代码有没有问题”，得到的通常是泛泛而谈。评审要可用，必须满足三个条件：**输入范围明确**（只看这次 diff）、**输出格式固定**（文件、行号、原因、建议）、**裁决权在人**（它提问题，你定是否阻塞）。

本文用 Claude Code 内置的评审命令加一个 `PreToolUse` hook，搭出这道工序。

## 前置条件

- 已能熟练使用 Claude Code 完成日常改动（见 [/articles/claude-code-workflow/](/articles/claude-code-workflow/)）
- 仓库有 `origin` 远端（`/security-review` 需要它来确定默认分支）
- 有一个待评审的 diff：本地分支或 PR 编号
- 安装 `jq`（hook 脚本里解析 JSON 用）

## 方式一：会话内的 /review

```text
/review
```

`/review` 是 `/code-review` 的别名，评审对象可以是当前 diff、PR 编号、分支名或路径。用它之前先自己确认范围：

```bash
git status
git diff --stat
```

范围越小，评审质量越高。几千行的 PR 一次性丢进去，只会得到一份正确的废话。

配套要求写清楚：

```text
/review 128
只报定位得到的问题，格式：文件:行号 | 级别(阻塞/建议) | 原因 | 修复方向。
不要复述改动内容，不要给"考虑增加测试"这类没有具体位置的建议。
如果某处你不确定，标注"待人工确认"而不是猜。
```

`/security-review` 是另一条独立通道：它分析当前分支相对 `origin` 默认分支的差异，专门找安全类问题。两者不重叠，也不互相替代。

## 方式二：无头模式，把评审放进脚本

评审最有价值的用法是**在提交前自动跑一遍**，而不是等人想起来。Claude Code 的 `-p` 模式适合做这件事。但先要区分两种评审，它们的 diff 来源不同：

| 场景 | 要审的内容 | 取 diff 的命令 |
| --- | --- | --- |
| 分支评审（PR 前） | 本分支相对主干已提交的内容 | `git diff origin/main...HEAD` |
| 提交前评审 | 已暂存 + 未暂存 + 未跟踪文件 | `git diff HEAD`，再加 `git ls-files --others --exclude-standard` |

这不是坐而论道，在同一仓库里实测同时存在三种改动（已提交的 b、已暂存的 extra.js、未暂存的 app.js 修改、未跟踪的 newfile.js）时：`git diff origin/main...HEAD --stat` 只输出 `app.js | 1 +`；`git diff HEAD --stat` 输出 `app.js` 和 `extra.js` 两行，**newfile.js 仍然不在里面**，只能靠 `git ls-files --others` 单独拿到。

提交前评审用这个组合，且**不替用户暂存任何东西**（`git add -A` 会把用户的半成品也带进 diff，还会改变工作区状态）。文件名可能带空格、中文、甚至换行，所以清单必须用 `git ls-files -z` 拿 NUL 分隔的输出，再用 `read -d ''` 读：

```bash
set -euo pipefail          # 任何一步失败就中止，不要带着不完整的 diff 去评审

list=$(mktemp)
trap 'rm -f "$list"' EXIT
git ls-files -z --others --exclude-standard > "$list"   # -z：文件名之间是 NUL，空格/中文/换行都不会被拆开

{
  echo "### 已跟踪改动（staged + unstaged）"
  git diff HEAD
  echo "### 未跟踪文件内容"
  while IFS= read -r -d '' f; do
    echo "--- $f"
    cat -- "$f" || { echo "读取失败：$f" >&2; exit 1; }   # -- 防止文件名以 - 开头时被当成选项
    echo                                                    # 文件末尾没有换行时，避免下一个 --- 粘在上一行
  done < "$list"          # 用重定向而不是管道：管道会把 while 放进子 shell，exit 1 就传不出来
} > /tmp/review.diff

git diff HEAD --stat        # 先看规模，超过几百行就分批评
```

三个细节都是实打实踩过的：

- **`for f in $(git ls-files ...)` 不能用**。命令替换会按空白拆分，`有 空格.ts` 变成一个不存在的文件、`中文名.ts` 在某些终端编码下也会散掉，而 `cat` 失败如果不检查，diff 里就静默少了整个文件——评审看起来“跑了”，实际漏审。
- **`cat` 失败必须中止**，否则漏掉的文件永远不会被发现；`set -e` 管不到被 `||` 吃掉的分支，所以要显式 `exit 1`。
- **`git ls-files` 自己失败也要管**：重定向到文件时它的退出码依旧由 `set -e` 捕获，这就是先用 `mktemp` 落盘、不从管道读的原因。

看 diff 时中文路径默认会被转义成 `"\344\270\255..."`，加 `-c core.quotepath=false` 就能正常显示：

```bash
git -c core.quotepath=false diff HEAD --stat
```

然后把评审调用接在后面：

```bash
claude -p "阅读 /tmp/review.diff，只报可定位的实质问题。
格式：文件:行号 | 阻塞或建议 | 原因 | 修复方向。
没有问题时只输出 NO_FINDINGS。" \
  --permission-mode plan \
  --allowedTools "Read" \
  --output-format json \
  --max-turns 6 > /tmp/review.json
```

分支评审则把第一段换成 `git diff origin/main...HEAD > /tmp/review.diff`，并在提示里写明“这是已提交的历史改动”，否则它会把“缺少未提交内容”当成问题报出来。

几点说明：

- `--permission-mode plan` 保证它只读不写，评审不该顺手改代码；
- `--allowedTools "Read"` 只是免询问白名单，真正限制工具集合应该用 `--tools "Read"`；
- `--output-format json` 便于脚本判断是否失败（退出码、`is_error` 字段），`--max-turns` 防止它在无关文件上打转；
- 把 diff 落到临时文件再读，比让它自己去猜“这次改了什么”更可控；
- 未跟踪文件直接 `cat` 进 diff 时，注意排除 `.env`、密钥文件这类不该进模型上下文的东西，用 `.gitignore` 或显式白名单控制。

评审发现应该由**另一个上下文**修复（人或另一个会话），别让同一个会话既提问题又宣布问题已解决。

## 方式三：用 hook 把“评审前不许动手”变成机制

口头约定靠不住，`PreToolUse` hook 能在工具调用前插一道检查。但它只能在脚本**正常跑起来**时拦截，所以当提示层用，别当发布门禁（失效场景见 [/articles/automation-checkpoints/](/articles/automation-checkpoints/)）。配置写在 `.claude/settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh"
          }
        ]
      }
    ]
  }
}
```

脚本从 stdin 读 JSON，用退出码表达决定：

```bash
#!/usr/bin/env bash
# .claude/hooks/guard.sh
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# 例：禁止在评审会话里推送或强推
if [[ "$cmd" == git\ push* ]]; then
  echo "Blocked: 本会话只做评审，不要推送" >&2
  exit 2
fi

exit 0
```

退出码语义要记准：**`exit 2` 是阻塞**，stderr 会作为原因回给模型；`exit 0` 放行；其他非零退出码、脚本没启动、输出非法 JSON 都是非阻塞错误，动作照常执行。想强制拦截就必须用 `2`。

两个让这段脚本静默失效的细节，跟上面是同一类问题：

- 忘记 `chmod +x .claude/hooks/guard.sh`，shell 执行时报 `Permission denied`（126），等于放行；
- 机器上没有 `jq`，`cmd` 恒为空，所有命令都走到 `exit 0`——钩子在，但从不拦截。把 `command -v jq >/dev/null || { echo "guard: jq missing" >&2; exit 2; }` 放在第一行，至少让缺依赖变成阻断而不是放行。

也可以用 JSON 输出（`exit 0` + `hookSpecificOutput.permissionDecision: "deny"`），适合需要给模型解释理由的场景。多个 hook 同时给出决定时，`deny` 优先级最高。

## 一份能用的评审清单

让模型按清单评，比让它自由发挥稳定：

1. **正确性**：边界输入、空值、并发、错误路径是否处理；
2. **契约变化**：函数签名、返回结构、数据库字段是否影响调用方；
3. **安全**：外部输入是否校验、权限是否越界、日志是否泄露敏感信息；
4. **资源**：循环里的 IO、无上限的查询、未关闭的连接；
5. **可验证性**：这次改动对应的测试是否真的会失败（如果实现回退）。

第 5 条最容易被忽略：测试通过不代表测试有效。

## 验收标准

1. 评审输出里每条问题都能落到“文件:行号”，没有“建议优化”这类空话；
2. 无头评审脚本在干净分支上输出 `NO_FINDINGS`，在人为注入错误的分支上能报出该错误；
3. hook 生效可复现：尝试执行被拦的命令时，模型收到明确的阻塞原因；
4. 每条阻塞项都有人工裁决记录（修 / 不修 / 转 issue）。

## 常见错误

- **让同一个会话自评自改。** 它会倾向于证明自己上一轮没错。
- **把 `/security-review` 当全面安全审计。** 它只看当前分支差异，配置、密钥管理、部署面不在其范围内。
- **hook 脚本用错退出码。** 用 `exit 1` 想拦截，实际只是报个错然后继续。
- **评审喂整个仓库。** 输入越大，定位越虚，最后还是要人重读。
- **用 `--output-format json` 却不解析。** 拿不到结构化结果，等于白开。

评审稳定之后，可以把它接到流水线里：[/articles/automation-pipeline/](/articles/automation-pipeline/)；想理解权限与信任边界的设计，读 [/articles/mcp-boundaries/](/articles/mcp-boundaries/)。

## 参考来源

- 内置命令（`/review`、`/security-review`）：<https://code.claude.com/docs/en/commands.md>
- CLI 参数（`-p`、`--output-format`、`--allowedTools`、`--max-turns`）：<https://code.claude.com/docs/en/cli-reference.md>
- Hooks 参考（事件、matcher、退出码语义）：<https://code.claude.com/docs/en/hooks>
- 权限模式：<https://code.claude.com/docs/en/permission-modes>
