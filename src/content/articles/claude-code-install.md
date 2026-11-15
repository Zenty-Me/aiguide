---
title: "Claude Code 安装：按平台用原生安装器，再验证登录"
description: "对照官方系统要求选择原生安装方式，用 claude --version 和 claude doctor 验证可执行文件，区分订阅与 API 认证，最后在一个练习仓库完成只读首任务。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 110
tags: ["Claude Code", "安装", "登录", "CLI", "环境配置"]
featured: false
---

## 目标：装得上、找得到、登得进

Claude Code 的安装问题通常被归成一句“命令不存在”，但实际有三层：系统是否满足要求、安装器是否把可执行文件放进了 PATH、当前账号是否能通过认证。把这三层分开验证，比反复重装更快。

本文按平台给出原生安装命令，然后用版本检查、诊断命令和登录状态逐层确认。原生安装不要求你先装 Node.js；Node 只在某些替代安装方式或项目工具链里才需要。

## 前置条件

官方当前列出的最低要求：

- macOS 13 以上；
- Windows 10 1809 以上或 Windows Server 2019 以上；
- Ubuntu 20.04 以上、Debian 10 以上或 Alpine 3.19 以上；
- 4 GB 以上内存，x64 或 ARM64；
- 可访问安装地址和登录服务的网络；
- Bash、Zsh、PowerShell 或 CMD 中至少一个可用终端。

账号方面，官方文档列出 Pro、Max、Ultra、Team、Enterprise 等付费计划，以及 Console/第三方 API 入口；免费计划不在支持范围内。具体可用计划和额度以账号页面为准，本文不写价格。

## 第一步：选原生安装方式

macOS、Linux 和 WSL 中使用同一条脚本：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows 原生环境在 PowerShell 中执行：

```powershell
irm https://claude.ai/install.ps1 | iex
```

在 CMD 中则用官方给出的三段落命令：

```bat
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

也可以走包管理器：macOS 用 `brew install --cask claude-code`，Windows 用 `winget install Anthropic.ClaudeCode`。原生安装器会自行处理运行时和后续更新，不要求预装 Node.js；包管理器的版本节奏可能不同，选一种并保持一致，不要在同一台机器上混装多个来源。

安装完成后**新开一个终端**，让 PATH 更新生效。

## 第二步：确认命令和安装健康度

```bash
claude --version
claude doctor
```

预期结果：版本号形如 `2.1.x (Claude Code)`，具体数字随安装时间变化；`doctor` 输出安装方式、自动更新状态和终端环境诊断。版本号能打印，说明命令至少能被 shell 找到；`doctor` 进一步回答“找到的是不是一个健康的安装”。

PowerShell 中用：

```powershell
Get-Command claude -All | Select-Object CommandType, Source, Path
claude --version
```

如果出现多个来源，先记录路径再决定保留哪一个。旧版本残留会让“我已经升级了”和“实际运行的还是旧版”同时成立。

## 第三步：登录，并区分认证方式

```bash
claude auth login
```

命令会引导你完成浏览器或设备上的登录。完成后检查状态：

```bash
claude auth status
```

预期输出是一段 JSON，包含是否登录、认证方式等信息；退出码 0 表示已登录，1 表示未登录。想要一行摘要可以用：

```bash
claude auth status --text
```

`authMethod` 可能显示 `claude.ai`、`oauth_token`、`api_key`、`api_key_helper` 或第三方入口。这个字段很重要：使用订阅登录和按 API 计费是两套账单，不要把“登录成功”直接等同于“走的是我以为的那套额度”。

如果组织允许用 API Key，可以设置 `ANTHROPIC_API_KEY` 跳过登录流程。不要把密钥写进仓库、截图或提交到 `.env`；只通过当前 shell 或密钥管理器注入，并确认它没有覆盖你原本想用的订阅登录。

## 第四步：在一个练习仓库完成只读任务

如果还没有练习仓库，先创建一个空仓库：

```bash
mkdir -p ~/code/scratch-repo
cd ~/code/scratch-repo
git init
```

然后启动会话：

```bash
cd ~/code/scratch-repo
git status --short
claude
```

在会话中输入：

```text
只读检查当前目录：列出顶层文件，说明项目类型和测试命令。
不要修改任何文件。先给结论，再列出你读过的文件。
```

预期结果（示意）：Claude 读取文件并给出说明；退出会话后再次执行 `git status --short`，应当没有变化。第一次先做只读任务，是为了把“能启动”和“能安全改代码”分开验证。若界面询问是否信任当前目录，先确认路径确实是练习仓库再同意。

## 平台差异

Windows 原生安装可用，但没有沙箱能力：官方对比表里原生 Windows 的 Sandboxing 一栏是 Not supported。WSL2 支持沙箱；WSL1 在 WSL2 不可用时仍可运行，同样不支持沙箱。需要 Linux 工具链或沙箱化命令执行时，在 WSL 内部重新执行 Linux 安装命令，而不是在 PowerShell 里安装后再从 WSL 调用。

Git for Windows 不是硬性前提。没有它时，Claude Code 会使用 PowerShell 工具；需要 Git Bash 时可用 `CLAUDE_CODE_GIT_BASH_PATH` 指定路径。不要把“必须装 Git Bash”当成通用要求。

## 常见失败与诊断

**1. 安装后仍然找不到 `claude`。** 新开终端，执行 `command -v claude`（PowerShell 用 `Get-Command claude -All`）。若路径不在 PATH，按安装器输出找到真实目录再修正；不要凭记忆添加一个不存在的路径。`claude doctor` 能补充安装方式与更新器状态。

**2. 版本号和预期不符。** 用 `type -a claude`（Bash）或 `Get-Command claude -All`（PowerShell）列出所有来源。原生安装会自动更新，包管理器版本可能滞后；不要用“再装一遍”覆盖另一个来源，先决定保留哪一种。

**3. `auth status` 退出码为 1。** 重新执行 `claude auth login`，确认账号属于受支持的计划；检查系统时间、代理和网络是否能完成回调。若设置了 `ANTHROPIC_API_KEY`，确认它是否是当前实际使用的认证方式。不要打印密钥来“确认它存在”。

**4. Windows 安装脚本被执行策略拦截。** 只对当前安装进程放宽执行策略，例如用 `powershell -ExecutionPolicy ByPass -c "irm https://claude.ai/install.ps1 | iex"`；不要永久把整机策略改成 `Unrestricted`。安装后可用 `Get-ExecutionPolicy -List` 确认没有残留。

**5. WSL 里提示未登录，但 Windows 上已经登录。** 这是两个环境、两个 home 目录。进入 WSL 后重新安装并登录；不要把 Windows 的凭据文件复制过去，也不要假设浏览器登录会自动共享。

## 验收清单

- [ ] 系统版本和内存满足官方最低要求。
- [ ] 只用一种安装来源，且新终端中 `claude --version` 可执行。
- [ ] `claude doctor` 没有指出安装或 PATH 异常。
- [ ] `claude auth status` 退出码为 0，且知道当前认证方式。
- [ ] 只读首任务完成，任务前后 `git status` 无变化。
- [ ] Windows 用户能说清自己用的是原生、WSL2 还是 Git Bash 路径。

## 接下来

安装完成后，先用 [Claude Code 工作流](/articles/claude-code-workflow/) 建立“读代码—改代码—验证”的节奏；如果希望它长期遵守项目约定，读 [CLAUDE.md 与规则文件](/articles/claude-code-memory/)。遇到登录、PATH 或 MCP 问题时，[故障排查](/articles/claude-code-troubleshooting/) 给出了只读检查顺序。

## 参考来源

- [Claude Code 安装与系统要求](https://code.claude.com/docs/en/setup)
- [Claude Code CLI 参考](https://code.claude.com/docs/en/cli-reference)
- [Claude Code 故障排查](https://code.claude.com/docs/en/troubleshooting)

核验范围（2026-11-14）：系统要求、原生安装命令、Windows/WSL 差异和认证状态语义依据上述官方页面核对。版本号与可用计划会变化；执行前以 `claude --version`、`claude doctor` 和账号页面为准。