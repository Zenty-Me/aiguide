---
title: "自动化人工检查点：放在哪、怎么拦、失效会怎样"
description: "全自动不是目标，可控才是。讲清检查点该放在哪些决策点、钩子为什么只能当提示层、真正的门禁为什么必须在 Agent 之外，以及“默认放行”的检查点比没有更危险。"
category: automation
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 550
tags: ["自动化", "人工审核", "hooks", "权限"]
featured: false
faq:
  - q: "把钩子当发布门禁为什么不行？"
    a: "钩子默认失败放行，脚本缺失、没有执行权限或超时被杀时动作照常执行；实测写明阻断的配置也没拦住，真正的门禁必须放在 Agent 之外的流水线层。"
  - q: "哪些自动化动作必须人工批准？"
    a: "不可逆、对外可见、涉及凭据的动作，例如合并主分支、部署生产、删除数据、改权限、轮换密钥和外发消息；其余默认放行，否则人会养成一路回车的习惯。"
  - q: "检查点该放在任务开始还是动作之前？"
    a: "放在副作用产生之前。任务开始时人还没有足够信息判断，看到具体 diff 和命令才能做知情批准；范围扩张和预算越界时也要各停一次。"
---

## 目标：在“全自动”和“全手动”之间找到关卡位置

流水线能跑通之后，下一个问题不是“怎么更自动”，而是**“哪些动作不能自动”**。检查点设计得对，自动化是加速器；设计得错，它只是把风险批量放大，还顺手取消了人类复核。

本文给出一条判断标准：**不可逆、对外可见、涉及凭据的动作，必须有人明确批准；其余默认放行。**

## 前置条件

- 已有一条能自动运行的流水线（见 [/articles/automation-pipeline/](/articles/automation-pipeline/)）
- Agent 工具的钩子（hooks）或 CI 的审批机制可用（两者不等价，下文区分）
- 能接受“检查点会让人等一会儿”

## 先分类：哪些动作必须卡

| 动作 | 是否必须人工 | 原因 |
| --- | --- | --- |
| 读代码、跑测试、生成 diff | 否 | 可回滚，无外部影响 |
| 提交到新分支、开草稿 PR | 否 | 可丢弃 |
| 合并到主分支 | **是** | 影响他人与发布 |
| 部署到生产、改线上配置 | **是** | 不可逆、影响用户 |
| 删除数据、改权限、轮换密钥 | **是** | 无法靠重跑恢复 |
| 发外部消息（邮件、评论、通知） | **是** | 发出即无法收回 |
| 提升凭据作用域 | **是** | 扩大后续风险面 |

这张表的用法：**不是给每个动作都加确认**，而是先判断它属于哪一行。给读操作加确认，人很快会养成“一路回车”的习惯，真正的危险动作也会被顺手放行——这是检查点最常见的设计错误。

## 卡在哪：三个位置

**位置一：副作用之前。** 在“将要产生不可逆效果”的那一刻拦，而不是在任务开始时问“要不要做”。任务开始时人还没有足够信息判断；看到具体 diff、具体命令时才能判断。

**位置二：范围扩张时。** Agent 从“改测试”变成“改实现”，从“本目录”变成“整个仓库”，从“只读”变成“可写”。这类扩张往往不是恶意，而是它自己判断“顺便修一下更好”。检查点要能识别**允许集合之外**的动作。

**位置三：预算越界时。** 轮次、耗时、花费超过预期阈值时停下来，而不是等到超时才被动失败。这一步能把“悄悄跑了一小时”变成“第 20 轮时问你”。

## 怎么卡：三道可落地的机制

### 机制一：钩子拦截（PreToolUse）——只能当提示层，不能当门禁

Claude Code 的 `PreToolUse` 钩子在工具执行前运行，输入通过 stdin 传入 JSON（包含 `tool_name`、`tool_input`）。官方文档给出的退出码语义是：

- `0`：继续（若输出了 JSON 字段，还要按这些字段判断是否放行）；
- **`2`：阻断**，stderr 内容作为原因反馈给模型——即使同时输出了 JSON，退出码 2 依然阻断；
- 其他非零、脚本没启动、输出非法 JSON：**非阻断错误，动作照常继续**。

关键在最后一条：钩子本身的失败默认是**放行**，不是阻断。这一点必须实测过才敢写进流程，我的结果是：

| 场景 | 动作是否被执行 |
| --- | --- |
| 脚本缺失，不写 `onFailure` | 执行了 |
| 脚本缺失，写 `"onFailure": "block"` | 执行了 |
| 脚本 `exit 2` | **被阻断**，模型收到 `PreToolUse:Bash hook error: [<脚本路径>]: policy: command blocked` |
| 脚本挂住 300 秒 + `"timeout": 3` | 3 秒内没有取消，整轮挂起 95 秒以上 |

测试环境是 Claude Code 2.1.284（Windows 版二进制，由 Git Bash 执行 shell 形式）。`onFailure` 与 `timeout` 是两个文档里有、但在这一版上没能按预期生效的字段，所以**不要把它们当成安全边界**：官方文档写的是“文档语义”，你机器上的版本是否兑现，要自己验一遍。

阻断高危命令的最小实现，`.claude/settings.json`（注意 `command` 外面套了一层引号，项目路径带空格时仍然能执行）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/require-approval.sh\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

`matcher` 只能按工具名过滤，而 `Bash` 会命中**所有** bash 调用——所以真正的命令筛选必须写在脚本里，否则 `git status`、`ls`、`npm test` 全被拦，人第一天就会把钩子删掉。

三个容易写错的地方：

- **不要加 `args`**。带 `args` 是 exec form：直接 spawn 可执行文件、不经 shell；省略 `args` 才是 shell form（`sh -c`，Windows 上是 Git Bash）。本文用 shell form，是因为实测过 `${CLAUDE_PROJECT_DIR}` 在这条路上能正确展开；走 exec form 时变量与命令展开的行为要自己验，别想当然。
- **路径要加引号**。`"${CLAUDE_PROJECT_DIR}/..."` 里的内层引号不能省，否则 `/home/me/my project` 这类带空格的路径会被拆成两个参数。
- **脚本必须可执行**：`chmod +x .claude/hooks/require-approval.sh`。漏了这步，shell 形式会以 `Permission denied`（126）失败，按上面的语义等于**放行**。

`.claude/hooks/require-approval.sh`：

```bash
#!/usr/bin/env bash
# 最小高危命令过滤器：只在命中少量模式时要求人工批准，其余放行
set -uo pipefail
input=$(cat)

# 从 stdin 的 JSON 里取 tool_input.command；解析不出来就退回原始文本（宁拦不漏）
cmd=$input
if command -v node >/dev/null 2>&1; then
  parsed=$(printf '%s' "$input" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { process.stdout.write(String(JSON.parse(s)?.tool_input?.command ?? "")); } catch {}
    });
  ')
  [ -n "$parsed" ] && cmd=$parsed
fi

hit=""
for pat in 'git push' 'git reset --hard' 'git clean -fd' 'rm -rf' 'npm publish' 'gh pr merge' 'terraform apply' 'kubectl apply'; do
  case "$cmd" in *"$pat"*) hit=$pat; break ;; esac
done

[ -z "$hit" ] && exit 0                    # 普通命令直接放行：git status / ls / npm test
[ -n "${HUMAN_APPROVED:-}" ] && exit 0      # 已人工批准

echo "检测到高危命令「$hit」，需要人工批准：审阅 diff 后设置 HUMAN_APPROVED=1 再运行。" >&2
exit 2
```

这个筛子有两个必须说清的局限，别把它当解析器：

- 它按**子串**匹配命令文本，所以 `git commit -m "顺便 git push"` 这种无害命令也会被拦（宁可误拦，不可漏放），而 `sh -c "git pu""sh"`、拼接变量、别名、`&&` 串联都能绕过；
- 它只覆盖 Bash 工具。写文件、发网络请求、调用其他 MCP 工具的路径根本不过这里。

所以定位是：**教学示例 + 减速带**，不是完整的 shell 安全边界。真正的“不可逆动作”要靠流水线闸门和平台侧权限（见下文机制三）。

这段脚本只在**脚本能正常跑起来**时才兑现“命中就阻断”：`exit 2` 覆盖不到脚本丢失、权限丢失、解释器缺失、超时被杀这些情况（实测见来源记录：脚本缺失时命令照常执行）。所以它的定位是**提前告知与减速带**，不是发布门禁。上线前做一次自检，把“钩子以为自己会拦”变成“确实拦过”：

```bash
chmod +x .claude/hooks/require-approval.sh
for c in "git status" "ls -la" "npm test" "git push origin main"; do
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$c" \
    | .claude/hooks/require-approval.sh >/dev/null 2>&1
  echo "$c => exit $?"     # 期望 0、0、0、2
done
HUMAN_APPROVED=1 .claude/hooks/require-approval.sh \
  <<<'{"tool_name":"Bash","tool_input":{"command":"git push"}}'; echo "approved_exit=$?"   # 期望 0
```

也可以用 JSON 决定，而不是退出码：`hookSpecificOutput.permissionDecision` 取 `allow | deny | ask | defer`，优先级为 `deny > defer > ask > allow`。`ask` 会转成人工确认提示——比直接 deny 更贴近“检查点”的语义，但同样受“脚本得先跑起来”这个前提约束。

### 机制二：权限模式分层

不同工具的权限模式是天然的关卡：

- Claude Code 的 `plan` 模式只允许读与写计划文件，不动源码，直到人批准计划；
- `acceptEdits` 会自动接受文件编辑，但仍是“可回滚的编辑”级别；
- `bypassPermissions` 会跳过所有确认，官方文档明确说它只适用于隔离容器，且**无法防御 prompt injection**——不要用它换取流畅体验；
- `dontAsk` 的语义是把“该问的”直接拒绝，适合无人值守场景。

配置项 `permissions.defaultMode` 可以设默认模式，但注意 `.claude/settings*.json` 里的 `auto` 和 `bypassPermissions` 会被忽略——这是刻意的保护，别试图绕过。

### 机制三：流水线层面的审批闸门——这才是真正的门禁

前两道机制的共同问题是：它们都在 Agent 进程内部，都由同一个会话里的配置决定，而且失败默认放行。真正能卡住不可逆动作的，是 Agent 碰不到的层：Git 服务端的分支保护、CI 的部署环境审批、制品仓库的发布授权。

这类能力各平台叫法不同，配置前确认你使用的平台当前支持哪种（例如 GitHub Actions 的 environment protection rules 可要求指定 reviewer 后才允许部署；具体行为以平台当前文档为准）。

它们与钩子的分工要划清：

- **钩子**：在动作发生前提醒、降速、拦住明显的手滑；适合“能卡住最好，卡不住也有人看得见”的场景；
- **外部门禁**：在产物产生后、对外生效前拦截；不依赖 Agent 的配置是否写对、脚本是否存在。

一个可用的组合是这样的，注意最后一步不在 Agent 手里：

```bash
#!/usr/bin/env bash
# scripts/release.sh —— 只负责“把产物交给门禁”，不负责“判断能不能发”
set -euo pipefail
artifact="dist/release-$(git rev-parse --short HEAD).tar.gz"
tar -czf "$artifact" dist/
sha256sum "$artifact" > "$artifact.sha256"

echo "产物：$artifact"
echo "下一步需人工在发布平台上批准这个 commit：$(git rev-parse HEAD)"
```

脚本里没有 `git push`、没有 `kubectl apply`、没有发布 token——它做不完发布，这是故意的。

关键设计：**批准的对象必须是具体产物**——一个 commit SHA、一个 diff、一次运行 ID，而不是一个笼统的“允许部署”。批准“允许部署”等于永久授权。

## 检查点本身的质量标准

一个坏的检查点长这样：弹窗只写“Agent 想运行 Bash，允许吗？”——人只能盲批。

好的检查点必须包含四要素：

1. **具体动作**：完整的命令或 diff 范围；
2. **影响面**：会改哪些文件、调哪个环境、用哪个凭据；
3. **可回滚性**：能否撤销，怎么撤销；
4. **一个明确的问题**：“是否允许合并这个 diff 到 main？”而不是“继续吗？”

另外三条纪律：

- **默认拒绝**（超时无人应答即中止，不自动通过）；
- **记录批准人**与批准时间，写进运行日志；
- **不要为同一动作设两层检查点**，重复确认会训练出无脑放行。

## 验收标准

1. 高风险动作（合并、部署、删除、外发消息）在不经过外部门禁时**无法生效**，而不是“钩子以为拦住了”；
2. 低风险动作（读、测试、生成 diff）不会打断流程；
3. 检查点给出的信息足以让人在不看日志的情况下做出判断；
4. 钩子失效时（脚本丢失、无执行权限、超时）系统仍然安全——因为最后一层不在钩子里；
5. 每次批准都有记录：谁、何时、批准了哪个具体产物。

## 常见错误

- **把钩子当发布门禁**。实测：脚本缺失时动作照常执行，`onFailure: "block"` 也没拦住；钩子只能辅助。
- **给所有动作加确认**。结果是全部被无脑批准，等于没有检查点。
- **在任务开始时问一次**。信息不足时的批准不是知情批准。
- **把 `bypassPermissions` 当默认**。官方文档已说明它不防注入，只适合隔离容器。
- **用自然语言“请小心操作”代替机制**。提示词不是拦截器。
- **批准“这个任务”而不是“这个产物”**。授权范围被无限放大。
- **检查点失败后自动重试并放行**。这会把“暂时无法确认”变成“默认允许”。

走到这里，从第一个任务（[/articles/codex-first-task/](/articles/codex-first-task/)）到流水线治理的主线已经串起来了。回顾设计取舍可以看 [/articles/agent-tool-loop/](/articles/agent-tool-loop/) 与 [/articles/mcp-boundaries/](/articles/mcp-boundaries/)。

## 参考来源

- Claude Code 钩子（`PreToolUse`、退出码语义、`onFailure`/`timeout` 字段、shell/exec form）：<https://code.claude.com/docs/en/hooks>。本文的钩子失效结论是在 Claude Code 2.1.284 上实测得到的，其它版本的默认值可能不同，上线前请按文中的自检命令重跑一遍。
- Claude Code 权限模式（`plan`、`acceptEdits`、`bypassPermissions` 的限制）：<https://code.claude.com/docs/en/permissions>
- Claude Code 设置项（`permissions.defaultMode`、被忽略的取值）：<https://code.claude.com/docs/en/settings>
- MCP 安全最佳实践中的“人类可拒绝”原则：<https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices>
- CI 平台审批闸门的具体配置随平台版本变化，本文只描述设计模式，未绑定某一平台的当前配置路径
