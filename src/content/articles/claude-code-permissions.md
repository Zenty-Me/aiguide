---
title: "Claude Code 权限：模式、规则和拒绝的优先级"
description: "分清权限模式、allow/ask/deny 规则和工具可用性，理解 deny 先于 ask 先于 allow 的匹配顺序，并用项目设置和只读验证排查“为什么被拒绝”。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 140
tags: ["Claude Code", "权限", "安全", "设置", "工具"]
featured: false
setupNote: true
faq:
  - q: "写了 allow 规则为什么还是被拒绝"
    a: "匹配顺序是 deny 先于 ask 先于 allow，第一条命中就生效；更宽的 deny 会挡住更具体的 allow，先用 /permissions 找到第一条命中的规则，再把它收窄。"
  - q: "--allowedTools 和 --tools 有什么区别"
    a: "前者只是免询问的预批准白名单，后者决定本次会话能用哪些工具；工具不在可用集合里就不可用，预批准不能把被排除的工具救回来。"
  - q: "脚本里项目 allow 规则为什么不生效"
    a: "项目设置里的 allow 和额外目录需要该文件夹本身通过工作区信任；无头会话不弹信任对话框，从未信任过时这些规则不会被采用，只信任父目录也不算。"
---

## 目标：把“允许”拆成三个不同的问题

Claude Code 的权限经常被简化成“要不要自动同意”。实际至少有三个问题：当前模式会不会弹窗、某条规则是否匹配这次调用、这个工具本身是否可用。三者任意一个没对上，表现都可能是“明明允许了却被拒绝”。

本文先看模式，再写一组最小规则，最后用一次无害调用验证拒绝顺序。目标不是找到最自动的配置，而是让每条放权都能对应到具体工具、具体参数和具体目录。

## 前置条件

- 已安装并登录 Claude Code。
- 一个练习仓库，里面有 `src/`、测试命令和一份不会提交的 `.env` 示例。
- 不要在生产仓库第一次试权限规则；也不要为了测试而往 `.env` 里放真实密钥。

## 第一步：认识当前模式

在会话中执行 `/permissions`，或启动时指定：

```bash
claude --permission-mode default
```

当前官方模式可以这样理解：

| 模式 | 行为 |
| --- | --- |
| `default` / `manual` | 每个工具第一次使用时询问；`manual` 是别名 |
| `acceptEdits` | 自动接受工作目录或额外目录内的文件编辑和常见文件操作，其他工具仍按规则处理 |
| `plan` | 默认只读探索：读文件、运行只读命令，不编辑源文件；auto 模式可用时，分类器批准的命令也可执行 |
| `auto` | 常规操作不逐次询问，由后台分类器判断是否与请求一致 |
| `dontAsk` | 本应询问的调用直接拒绝；已预批准或本身无需批准的操作仍可运行 |
| `bypassPermissions` | 跳过权限提示，但并非所有动作都会被自动批准 |

`bypassPermissions` 官方明确只建议在容器、虚拟机等隔离环境使用；它还会跳过对 `.git`、`.claude` 等受保护路径的写入提示。不要把它当作“解决弹窗”的通用开关。

如果是团队仓库，可以在设置里禁用高风险模式：

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  }
}
```

这个键适合放在受管理的设置中，避免每个开发者各自决定。

## 第二步：写一组最小规则

在 `.claude/settings.json` 中：

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Bash(git push *)"
    ],
    "ask": [
      "Bash(git commit *)"
    ],
    "allow": [
      "Bash(npm test *)",
      "Read(./src/**)"
    ]
  }
}
```

规则由工具名和可选参数组成。`Bash(npm test *)` 只匹配以 `npm test` 开头的命令；`Read(./src/**)` 限定读取目录；`Bash(git push *)` 拒绝推送。在 deny 中，没有参数的裸工具名会移除整个工具；在 allow 中则等于预批准整个工具，例如 `Bash`。

匹配顺序是 **deny → ask → allow**，先命中先决定，规则写得越具体也不会插队。因此一条宽的 `Bash(git *)` deny 会挡住更窄的 `Bash(git status)` allow；allow 不能从 deny 里挖例外。需要精细控制时，deny 要写得足够窄，allow 才有意义。

## 第三步：验证拒绝和允许

先验证一个被拒绝的读取。在会话中要求：

```text
读取 .env，告诉我里面有哪些配置项名称；不要打印值。
```

预期结果（示意）：读取被拒绝，或 Claude 说明该路径受权限规则保护。`Read` deny 不只管内置文件工具：Claude Code 会识别 Bash 中的 `cat`、`head`、`tail`、`sed`、`tee` 以及重定向目标（`> .env`、`< .env`）并同样拦截。但它不覆盖不具名读取的命令（例如在敏感文件所在目录运行 `grep -r pattern .`），也不覆盖自行打开文件的 Python/Node 子进程；需要操作系统级强制时，启用 sandbox。

再验证允许的测试命令：

```text
运行 npm test，只报告通过/失败数量。
```

预期：命令按 allow 规则执行，不再逐次询问；若仍询问，说明规则没有匹配实际命令行（例如实际是 `npm run test`，而不是 `npm test`）。

## 第四步：区分“预批准”和“工具可用”

命令行里有两个容易混淆的选项：

- `--allowedTools` 预批准某些调用，减少询问；
- `--tools` 限制本次会话可用的工具集合。

```bash
claude --tools "Read,Grep,Glob" --allowedTools "Read(./src/**)"
```

这段配置只让 Claude 使用只读检索工具，并预批准 `src/` 下的读取。它不会因为 `--allowedTools` 里写了 `Bash(...)` 就凭空增加 Bash；工具不在 `--tools` 集合里就是不可用。反过来，`--allowedTools` 也不能覆盖受管理设置中的 deny：工具在任一层被拒绝，其他层不能再放行。

## 第五步：项目规则与工作区信任

项目 `.claude/settings.json` 里的 `allow` 规则和 `additionalDirectories` 会授予能力，因此只有在接受该文件夹的工作区信任对话框后才会生效。`deny` 和 `ask` 只做限制，不受信任状态影响。

信任必须针对项目文件夹本身：只信任父目录或更上层目录不算数（官方原文：Trusting a parent folder doesn't count for these rules），该文件夹仍需再次接受信任对话框。这一点在自动化里尤其重要：`claude -p` 和 SDK 会话不会显示信任对话框。如果这个项目文件夹从未接受过信任对话框，项目 `allow` 规则和 `additionalDirectories` 不会被采用，stderr 会出现工作区未受信任的警告；之前已在交互会话里显式信任过该项目文件夹，`-p` 会照常采用。若 CI 依赖项目 allow 规则，不要假设它会静默生效；先确认信任状态，或显式传入所需配置，并检查警告。不要用 `bypassPermissions` 来“消除”这个警告。

## 常见失败与诊断

**1. 写了 allow 仍然被拒。** 按 deny → ask → allow 的顺序找第一条匹配。常见原因是存在更宽的 deny，或某个 ask 规则先命中。`/permissions` 可以查看当前规则；修改后重开会话，确认没有缓存旧设置。

**2. 只想禁用子命令，却把整个工具禁了。** 检查是否在 deny 中写成裸 `Bash`。deny 的裸 `Bash` 会移除工具；allow 的裸 `Bash` 则会放行所有 Bash 命令。`Bash(git push *)` 只影响匹配的调用；反过来，若希望完全不允许某类操作，裸工具名比一串子命令更可靠。

**3. `--allowedTools` 看起来没生效。** 它只预批准，不负责限制；如果工具被 `--tools` 排除，或被 deny 规则挡住，预批准不会救回来。用 `--tools` 控制“能不能用”，用 allow 规则控制“要不要问”。

**4. `claude -p` 中项目 allow 规则不生效。** 先确认这个项目文件夹是否从未被信任。从未信任时这是预期行为，不是 bug：非交互会话没有信任对话框，项目级 allow 不会被采用，仅信任父目录也不生效；已在交互会话中显式信任过该项目文件夹则不受影响。确实需要时，显式提供权限配置，或改由用户级设置授权。不要把项目设置复制到命令行时把 deny 一起丢掉。

**5. 以为拒绝了 Read 就挡住了所有读取。** Shell 命令、脚本和 MCP 工具都可能用不同路径读取同一文件。对敏感文件，除了 `Read` deny，还要限制 Bash 的对应命令，或把文件移出工作区、使用独立凭据。权限规则不是内核级沙箱，不能替代密钥管理。

## 验收清单

- [ ] 能说出当前模式，以及它和其他模式的关键差异。
- [ ] deny、ask、allow 各至少有一条规则，并知道匹配顺序。
- [ ] 验证过一次拒绝和一次允许，结果与规则一致。
- [ ] 分得清 `--allowedTools`（预批准）和 `--tools`（可用集合）。
- [ ] 知道项目 allow 规则需要工作区信任，`-p` 下不会弹窗。
- [ ] 没有用 `bypassPermissions` 作为常规排错手段。

## 接下来

权限规则依赖项目上下文时，先读 [CLAUDE.md 与规则文件](/articles/claude-code-memory/)；要限制子代理能碰什么，读 [只读评审子代理](/articles/claude-code-subagents/)。日常改动节奏可参考 [Claude Code 工作流](/articles/claude-code-workflow/)。

## 参考来源

- [Claude Code 权限](https://code.claude.com/docs/en/permissions)
- [Claude Code CLI 参考](https://code.claude.com/docs/en/cli-reference)
- [Claude Code 记忆与项目指令](https://code.claude.com/docs/en/memory)

核验范围（2026-11-14）：模式列表、规则匹配顺序、工具选项和工作区信任行为依据官方页面核对。模式名称和默认值可能随版本变化；执行前用 `/permissions`、`claude --help` 和当前设置确认。