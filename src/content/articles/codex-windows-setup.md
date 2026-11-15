---
title: "Windows 上的 Codex 环境：PowerShell、路径与换行符"
description: "在原生 Windows 上确认 Codex 命令来源、选对项目目录，分清 PowerShell 与 WSL 的路径和凭据，再用一条只读任务验证环境；不假设 Windows 必须依赖 WSL。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 20
tags: ["Codex", "Windows", "PowerShell", "WSL", "环境配置"]
featured: false
---

## 目标：在正确的 shell 里，对正确的目录说话

Windows 上的问题很少出在模型本身，更多是“命令在哪个 shell 执行”“项目在哪个文件系统”“脚本被哪种换行符保存”。这三件事任意一件错了，表现都像 Codex 不会用。

本文只使用 PowerShell 完成安装后的环境确认和一个只读任务。WSL 会作为对照出现，但不是必选项：Codex 可以在原生 Windows 运行；当你依赖 Linux 工具链，或明确需要 WSL2 里的 Linux 沙箱时，再选择 WSL。

## 前置条件

- Windows 10 或 Windows 11，PowerShell 5.1 以上。
- 已按官方方式安装 Codex CLI；本文不重复安装步骤。
- 一个本地项目目录。第一次练习建议放在 `C:\work` 这类路径简单的位置，不要放在 OneDrive 同步目录或含大量空格的深层目录。
- 项目已用 Git 管理，至少有过一次提交，便于用 `git status` 判断是否被改动。

## 第一步：确认命令、版本和来源

打开 PowerShell，先看当前目录和命令来源：

```powershell
Get-Location
Get-Command codex -All | Select-Object CommandType, Source, Path
codex --version
```

`Get-Command` 比只跑 `codex --version` 多给一条关键信息：实际执行的是哪个文件。若列表里出现多个来源，按顺序检查哪一个排在前面。预期结果是只有一个 `Application` 或 `ExternalScript` 条目，`Source`（应用）或 `Path`（脚本）指向你安装的位置；版本号的具体格式随版本变化。

如果命令来自一个你已经不用的 npm 全局目录，而你又用官方安装包装过一遍，不要继续猜。先记录两个路径，再决定保留哪一个；混装是后续“版本不对”“登录状态不对”的常见根源。

## 第二步：把项目目录和 shell 对齐

在 PowerShell 中创建并进入练习目录：

```powershell
New-Item -ItemType Directory -Force C:\work\codex-demo | Out-Null
Set-Location C:\work\codex-demo
Get-Location
```

路径含空格时必须加引号：

```powershell
Set-Location "C:\work\my codex demo"
```

新建的空目录还不是 Git 仓库，而后面的 `git status`、`git ls-files --eol` 都需要它。先建立一次基线提交：

```powershell
git init
Set-Content README.md "# codex-demo"
git add README.md
git commit -m "chore: initial commit"
```

若提交时报缺少身份，先在本仓库设置 `git config user.name "你的名字"` 与 `git config user.email "you@example.com"`。这里只是练习仓库，不要把这些值写进全局配置去影响其他项目。

这时项目在 Windows 文件系统上，Codex 也在 Windows 上运行，路径、权限和 Git 都是同一套。不要在这个会话里输入 `/mnt/c/...` 这类 WSL 路径；PowerShell 不认识它。

WSL 的路径是另一套映射：Windows 的 `C:\work\codex-demo` 在 WSL 中通常对应 `/mnt/c/work/codex-demo`。如果你在 WSL 里工作，应该从 WSL 终端启动 Codex：

```bash
wsl --cd /home/you/code/codex-demo
```

上面这条命令本身是在 PowerShell 里调用 WSL；进入后运行的 `codex` 是 WSL 环境里的那个。两边的 home 目录不同，`~/.codex` 配置和登录凭据通常也不共享。不要把 Windows 上“已经登录”当成 WSL 也已登录。

跨文件系统访问还有性能差异：项目放在 `/mnt/c` 时，WSL 里的文件操作要经过转换层，通常比放在 WSL 自己的文件系统里慢。若工具链主要在 WSL，优先把仓库放在 WSL 主目录；若工具链主要在 Windows，就留在 `C:\`，不要为了“看起来像 Linux”来回搬。

## 第三步：把换行符当成项目配置

Windows 默认的 CRLF 换行在 PowerShell 里通常没问题，但带 shebang 的 shell 脚本进入 WSL 或 Linux 容器后可能直接报：

```text
/usr/bin/env: 'bash\r': No such file or directory
```

这不是 Codex 的错，而是文件在进入 Linux 环境前没有被规范化。先查看现状：

```powershell
git config --get core.autocrlf
git ls-files --eol
```

`git ls-files --eol` 会列出索引和工作区里每个文件的换行信息。若只有少数脚本是 CRLF，不要全仓库盲目转换；在 `.gitattributes` 中按类型声明：

```text
* text=auto
*.sh text eol=lf
*.ps1 text eol=crlf
```

提交这个文件后，Git 会在检出时按规则处理文本文件。修改已有文件后先看 `git diff`，确认没有把整份文件都标成改动，再决定是否执行 `git add --renormalize .`。二进制文件不要套用文本规则。

## 第四步：跑一条不写文件的冒烟任务

在项目目录中先确认工作区干净：

```powershell
git status --short
```

然后让 Codex 只读检查：

```powershell
codex --ask-for-approval never exec --sandbox read-only "只读检查当前目录：列出顶层文件，说明项目类型、启动命令和测试命令；不要修改任何文件。"
```

预期结果（示意，实际内容由模型生成）：进度信息写 stderr，最终的中文说明写 stdout；PowerShell 同一窗口里两者连续显示。随后再次执行：

```powershell
git status --short
```

应当没有输出。这个任务同时验证了三件事：Codex 能在当前目录启动、只读沙箱生效、模型能读到项目文件。它不验证写权限，也不验证测试命令一定正确；那些留给下一个任务。

## 常见失败与诊断

**1. `codex` 不是可识别的命令。** 先重开 PowerShell，再执行 `Get-Command codex -All`。如果 npm 安装，运行 `npm config get prefix`，确认其下的 bin 目录在 `$env:Path` 中；不要凭记忆往 PATH 里追加一个不存在的目录。找到真实路径后，再决定是修 PATH 还是卸载多余安装。

**2. 在 PowerShell 里执行 `grep`、`sed` 报“无法识别”。** 这不是 Codex 缺少能力，而是当前 shell 没有这些 Unix 工具。用 PowerShell 等价命令，例如 `Select-String` 搜索、`Get-Content` 读取；或者明确切换到 WSL 再执行 Linux 命令。不要把 Linux 命令写进给 Windows 用户的步骤里，也不要在 PowerShell 中假装它们在。

**3. WSL 中运行脚本报 `bash\r`。** 用 `git ls-files --eol` 找到 CRLF 的脚本，按上面的 `.gitattributes` 规则修正，再重新检出或规范化。不要用 `dos2unix` 批量处理整个仓库，除非你已经确认没有二进制文件和生成文件会被误改。

**4. Windows 上能用，WSL 里却要求重新登录。** 这是两个独立的运行环境，不是同一个配置的两种外壳。分别执行 `Get-Command codex`（Windows）和 `wsl which codex`（WSL），确认各自的二进制与 home 目录，再分别完成登录。不要把一边的凭据文件复制到另一边来“省事”。

**5. 安装脚本被 PowerShell 执行策略拦截。** 使用官方给出的进程级 `-ExecutionPolicy ByPass` 一行命令，只影响那一次安装；不要永久把执行策略改成 `Unrestricted`。安装完成后用 `Get-ExecutionPolicy -List` 确认没有留下全局放宽。

## 验收清单

- [ ] `Get-Command codex -All` 只指向你预期的安装，且 `codex --version` 可执行。
- [ ] `Get-Location` 显示的项目目录与 Codex 会话中的目录一致。
- [ ] 能说清当前用的是原生 Windows 还是 WSL，以及对应的路径写法。
- [ ] `git ls-files --eol` 中没有意外的 CRLF 脚本。
- [ ] 只读任务返回了项目说明，任务前后 `git status --short` 均无变化。
- [ ] 没有把 Linux 命令当作 PowerShell 的默认能力。

## 接下来

环境确认后，用 [Codex CLI 第一次任务](/articles/codex-first-task/) 建立“改动—测试—diff”闭环；需要理解为什么写文件会被拒绝时，读 [Codex 权限模型](/articles/codex-permissions/)。如果你准备并行处理两个独立改动，[用 Git worktree 隔离 Codex 任务](/articles/codex-worktrees/) 比复制目录更可靠。

## 参考来源

- [Codex CLI 官方文档](https://learn.chatgpt.com/docs/codex/cli)
- [Codex 沙箱与审批](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Codex Windows 沙箱说明](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [Codex WSL 说明](https://learn.chatgpt.com/docs/windows/wsl)
- [Git attributes 官方文档](https://git-scm.com/docs/gitattributes)

核验范围（2026-11-14）：PowerShell 命令、Windows/WSL 路径差异、沙箱实现和换行规则依据上述官方页面核对。具体安装路径与版本号因机器而异；执行前用 `codex --help` 和本机 PowerShell 的实际补全确认参数。