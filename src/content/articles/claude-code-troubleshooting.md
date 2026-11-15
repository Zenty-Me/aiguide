---
title: "Claude Code 故障排查：先只读检查，再做最小修复"
description: "按“症状—只读检查—最小修复—验证”的顺序处理命令找不到、登录失败、记忆未加载、权限被拒和 MCP 连接失败，不打印密钥，也不删除用户状态。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 180
tags: ["Claude Code", "故障排查", "诊断", "MCP", "权限"]
featured: false
---

## 目标：用证据缩小问题，而不是重装一切

Claude Code 的故障往往横跨安装、认证、项目上下文、权限和 MCP。看到“不能用”就重装，可能暂时掩盖问题，也可能把原来的登录状态和项目配置一起弄丢。

本文用一张分诊表把症状对应到只读检查，再给出四个最小修复案例。原则很简单：先收集不会改变状态的证据，再做可回退的最小改动，最后用同一条命令验证。任何步骤都不需要打印密钥、上传完整日志或删除配置目录。

## 前置条件

- 已安装 Claude Code；如果连安装都没有完成，先看 [安装与登录](/articles/claude-code-install/)。
- 知道当前 shell 是 Bash、PowerShell 还是 WSL，以及项目目录在哪里。
- 准备一个无害的练习仓库；不要拿生产仓库做权限或 MCP 试验。
- 任何日志在分享前先脱敏；不要粘贴 token、cookie、完整环境变量或 heapdump。

## 第一步：按症状做只读分诊

| 症状 | 先做的只读检查 | 常见方向 |
| --- | --- | --- |
| 终端找不到 `claude` | `command -v claude`、`Get-Command claude -All`、`claude doctor` | PATH、安装来源、是否需要新终端 |
| 提示未登录或认证失败 | `claude auth status`、`claude auth status --text` | 账号计划、浏览器回调、API Key 环境变量 |
| 项目约定不生效 | `/context all`、`/memory`、`claude --debug` | 文件位置、加载顺序、规则路径 |
| 操作被拒绝 | `/permissions`、项目设置、`claude --debug` | deny/ask 优先级、工作区信任 |
| MCP 连不上或没有工具 | `claude mcp list`、`claude mcp get <name>`、`/mcp` | 命令路径、stdio 日志、作用域 |
| 会话变慢或输出异常 | `claude doctor`、`--safe-mode` | 自定义配置、项目位置、上下文大小 |

只读检查的顺序是从外到内：先确认可执行文件，再确认认证，再看项目配置，最后看具体工具。不要一上来就改 `.claude/settings.json` 或删除 `~/.claude`；那会把多个变量同时改掉，之后无法判断是哪一步生效。

## 第二步：命令找不到时，先找路径

Bash：

```bash
command -v claude
claude --version
claude doctor
```

PowerShell：

```powershell
Get-Command claude -All | Select-Object CommandType, Source, Path
claude --version
claude doctor
```

预期：`command -v` 输出一个真实路径，`--version` 打印版本，`doctor` 报告安装与更新器状态。若命令不存在，先新开终端；仍不存在时，按安装器输出找到目录，再修正 PATH。

最小修复是“让当前 shell 指向正确安装”，不是“把所有历史安装删掉”。若存在多个来源，先记录各自的路径和版本，再决定保留哪一个；一次性卸载可能连带删除你正在用的配置。

## 第三步：认证失败时，先看状态而不是密钥

Bash：

```bash
claude auth status
printf 'exit=%s\n' "$?"
```

预期：已登录时输出 JSON 且退出码 0；未登录时退出码 1。需要一行摘要时用 `claude auth status --text`。失败时重新执行 `claude auth login`，确认账号计划，并检查时间、代理和回调网络。

若设置了 `ANTHROPIC_API_KEY`，先确认它是否是当前实际使用的认证方式。不要打印密钥；只看是否设置。需要排除它时，仅在当前终端临时取消并重试，不要改全局配置。验证标准是 `auth status` 退出码恢复为 0，而不是登录页面看起来成功。

## 第四步：记忆不生效时，检查加载而不是继续加字

在会话中：

```text
/context all
/memory
```

预期：`/context all` 的 Memory files 区域列出实际加载的文件；`/memory` 可以查看和编辑记忆文件。若项目 `CLAUDE.md` 不在列表里，检查启动目录、文件位置和加载顺序；若是按路径的规则，确认当前操作的文件匹配 `paths`。

`claude --debug` 可以暴露规则解析问题。想排除自定义配置干扰时，可用 `claude --safe-mode` 启动一次；它用于判断是否由插件或记忆导致，不是长期修复。确认后缩小或拆分记忆，不要删除全部本地记忆。

修复后用同一个问题验证，例如“这个项目用什么测试命令”。回答应引用项目约定；如果仍然泛泛而谈，回到 `/context all` 看文件是否真的加载。

## 第五步：权限被拒时，按匹配顺序找第一条

```text
/permissions
```

检查 deny、ask、allow 三组规则。匹配顺序是 deny → ask → allow，第一条命中就决定结果；更具体的 allow 不能覆盖更宽的 deny。项目 `.claude/settings.json` 里的 allow 规则和额外目录还需要工作区信任：`claude -p` 不显示信任对话框，**目录从未被信任过**时这些规则不会被采用，stderr 会有提示；之前信任过则照常生效。

最小修复是收窄规则，而不是打开 `bypassPermissions`。修完后用无害命令验证，例如 `git status`；确认不再询问，且 deny 仍能挡住敏感路径。

## 第六步：MCP 失败时，先确认服务器和传输

```bash
claude mcp list
claude mcp get wordcount
```

预期：能看到服务器名称、作用域、命令和连接状态。若失败，检查命令是否绝对路径、`node` 是否在 PATH、服务器日志是否误写到 stdout。stdio 的 stdout 是 JSON-RPC 通道，调试输出必须走 stderr。需要更多信息时用 `claude --debug=mcp`。

项目级 `.mcp.json` 需要批准；`claude -p` 行为不同，使用 `--strict-mcp-config` 时确认配置已传入。修复后执行 `/mcp` 确认状态和工具数，再调用一次。不要删除 `~/.claude.json`；先记录作用域和服务器定义。

## 常见失败与诊断

**1. 重装后仍然找不到命令。** 安装器可能装到了新目录，而当前 shell 的 PATH 还是旧的。用 `command -v`/`Get-Command` 找实际路径，新开终端再试；不要在没有记录的情况下删除旧目录。

**2. 登录成功但请求立刻失败。** 检查 `auth status` 的认证方式、账号计划、网络和代理；若同时存在 API Key，确认实际使用的是哪一种。不要把密钥打印到终端或日志，也不要把 `auth.json` 贴到 issue 里。

**3. `/context all` 看不到项目文件。** 确认启动目录在项目根或其子目录；从项目根的上级目录启动不会向下加载。规则文件检查 frontmatter 和 `paths`，`claude --debug` 会报告解析错误。

**4. 权限规则“时好时坏”。** 先看是否在不同目录、不同信任状态或 `-p`/交互会话中测试。项目 allow 在未信任时不生效，`--allowedTools` 也不能覆盖受管理的 deny。不要用“全部允许”来制造一致性。

**5. 会话异常缓慢。** 若项目在 WSL 的 `/mnt/c` 下，文件访问通常比 WSL 自己的文件系统慢；把仓库复制到 WSL 主目录后重新验证，确认无误再决定是否迁移。不要直接删除原目录。性能问题也可以用 `claude doctor` 和 `--safe-mode` 排除配置因素。

## 验收清单

- [ ] 每个问题都先有只读检查结果，再动手修改。
- [ ] 命令、认证、上下文、权限、MCP 五类症状能对应到检查入口。
- [ ] 修复只改一个变量，并用原命令复验。
- [ ] 没有打印密钥、cookie 或完整环境变量。
- [ ] 没有删除用户配置、记忆或仓库状态来“清干净”。
- [ ] 需要升级问题时，能提供脱敏后的版本、shell、复现步骤和错误文本。

## 接下来

安装和登录的基础问题，回到 [Claude Code 安装](/articles/claude-code-install/)；项目约定不生效，读 [CLAUDE.md 与规则文件](/articles/claude-code-memory/)；MCP 的连接和作用域，读 [接入本地 stdio MCP 服务器](/articles/claude-code-mcp/)。

## 参考来源

- [Claude Code 故障排查](https://code.claude.com/docs/en/troubleshooting)
- [Claude Code 安装与系统要求](https://code.claude.com/docs/en/setup)
- [Claude Code CLI 参考](https://code.claude.com/docs/en/cli-reference)

核验范围（2026-11-14）：诊断入口、认证状态语义、`--safe-mode`、`/context all`、MCP 调试和工作区信任行为依据官方页面核对。具体输出与命令随版本变化；执行前用 `claude --help`、`claude doctor` 和当前会话的斜杠命令确认。