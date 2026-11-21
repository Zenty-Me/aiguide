---
title: "Codex CLI 安装与登录：把第一条命令跑成只读验收"
description: "从官方安装脚本或 npm 两条路径装上 Codex CLI，分清 ChatGPT 登录与 API Key 的计费边界，再用一条只读任务同时验证可执行文件、凭据和工作目录。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 10
tags: ["Codex", "CLI", "安装", "登录", "认证"]
featured: false
setupNote: true
---

## 目标：先证明“能读”，再证明“能改”

安装 Codex CLI 时有两个独立问题容易被混在一起：终端到底找不找得到 `codex`，以及当前凭据能不能调用模型。前者是 PATH 问题，后者是认证或计费问题。只看到欢迎界面，不能说明两件事都成立。

本文用一个不修改任何文件的只读任务收尾。完成后你应该能说清楚三件事：Codex 从哪个路径启动、当前用的是哪类凭据、一次只读请求是否真的返回了结果。

## 前置条件

- 一个可用的终端：macOS/Linux 用 Bash 或 Zsh，Windows 用 PowerShell。
- 能访问安装地址和登录回调所需的网络。
- 一个可以随便读的本地 Git 仓库；没有的话先建一个空仓库即可，不要拿生产仓库做第一次试验。
- 如果走 npm 路线，本机已有可用的 Node.js 与 npm；官方安装脚本不要求你先配好 Node.js。

## 第一步：选一条安装路线

macOS、Linux 和 WSL 中优先用官方安装脚本：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Windows 原生环境在 PowerShell 中执行：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

`-ExecutionPolicy ByPass` 只对这一次安装进程生效，不是让你永久关闭 PowerShell 的执行策略。装完后重开一个终端，让新的 PATH 生效。

已经有 Node.js 工具链时，也可以用 npm：

```bash
npm install -g @openai/codex
```

两条路线选一条即可。不要一边用官方脚本、一边又用 npm 覆盖安装；后面出现“版本不对”或“命令指向旧目录”时，会很难判断实际运行的是哪一个二进制。Homebrew 用户也可以按官方说明用 cask 安装，同样不要和 npm 全局包混装。

先确认命令能被发现：

```bash
codex --version
```

预期输出是版本号，具体数字随安装时间变化，本文不写死。若命令不存在，先不要怀疑模型或账号，转到文末的 PATH 排查。

## 第二步：选择登录方式，并明确计费边界

Codex 支持两类常见入口：

| 入口 | 适合谁 | 计费与权限边界 |
| --- | --- | --- |
| ChatGPT 账号登录 | 已有符合条件的 ChatGPT 计划，希望直接用订阅内的 Codex 能力 | 走 ChatGPT 计划的 Codex 使用额度；具体额度随计划调整，本文不写固定价格 |
| API Key | 需要按 API 用量结算，或要把调用放进自动化 | 按标准 API 费率计费，和 ChatGPT 订阅是两套账单 |

交互式登录：

```bash
codex login
```

命令会给出浏览器登录地址。没有图形界面的服务器可以用设备码流程：

```bash
codex login --device-auth
```

该流程在当前官方文档中标注为 beta；如果企业网络拦截回调，它通常比“把浏览器回调地址复制来复制去”更稳。用 API Key 登录时，避免把密钥直接写进命令历史：

```bash
printenv OPENAI_API_KEY | codex login --with-api-key
```

`printenv` 仍然会把值送进管道，但不会像 `codex login --with-api-key sk-...` 那样把密钥留在 shell 历史里。更稳妥的做法是由密钥管理器注入环境变量，并在用完后清理。

检查登录状态：

```bash
codex login status
```

有凭据时退出码为 0；没有凭据时为非 0。注意它只回答“本地有没有可用凭据”，不保证额度充足、网络可达或所选模型可用。凭据通常保存在 `~/.codex/auth.json` 或操作系统钥匙串中，具体取决于 `cli_auth_credentials_store` 配置；无论存在哪里，都按密码级别保护，不要提交、截图或贴进聊天。

如果你同时设置了 `OPENAI_API_KEY` 环境变量，又做过 ChatGPT 登录，先确认本次会话实际会用哪一种。排查计费问题时，不要只看“登录成功了”，还要看环境变量和当前配置。

## 第三步：跑一条只读任务

进入一个 Git 仓库，先记录工作区状态：

```bash
cd ~/code/scratch-repo
git status --short
```

然后用非交互模式发一条明确禁止写入的请求：

```bash
codex --ask-for-approval never exec --sandbox read-only \
  "只读检查当前目录：列出顶层文件，说明项目类型和启动命令；不要修改任何文件。"
```

预期结果（示意，实际文字由模型生成）：进度信息写 stderr，最终的项目说明写 stdout；在终端里两者都连续显示，只有重定向时才会分开。`read-only` 沙箱负责阻止写文件，`--ask-for-approval never` 让无人值守场景不弹出审批；两者不是同一个开关。`--ask-for-approval` 是全局参数，必须写在 `exec` 之前，写成 `codex exec ... --ask-for-approval never` 会直接报 `unexpected argument`。若你希望每一步都可见，可以去掉 `--ask-for-approval never`，或直接运行 `codex --sandbox read-only` 进入交互会话。

最后再查一次工作区：

```bash
git status --short
```

应当没有新增输出。若出现改动，不要先怪模型：确认你是在预期目录启动的，并检查 shell 的当前路径。只读沙箱能阻止写入，但不能阻止你在错误的仓库里提问。

## 常见失败与诊断

**1. 安装后仍然 `command not found`。** 新开终端再试；用 `command -v codex`（PowerShell 用 `Get-Command codex`）看实际路径。npm 路线可用 `npm config get prefix` 找到全局 bin 目录，确认它在 PATH 中。不要同时保留多个来源的 `codex`，否则 `--version` 可能来自旧安装。

**2. `codex login status` 非 0，或浏览器登录一直不返回。** 先确认你登录的是当前终端所属的环境：Windows 原生、WSL 和远程服务器各有自己的 home 目录与凭据，不能互相代替。无图形界面时改用 `codex login --device-auth`。企业 TLS 拦截场景下，官方文档给出 `CODEX_CA_CERTIFICATE`（或 `SSL_CERT_FILE`）指定 CA 证书；不要用关闭证书校验来“解决”。

**3. 能登录但请求立刻失败，或账单归属不对。** 检查当前是否设置了 `OPENAI_API_KEY`，以及它是否会覆盖你以 ChatGPT 账号登录的预期。API Key 按 API 费率计费，ChatGPT 计划走订阅额度；两者不要混着排查。不要把密钥打印到终端或日志里，用“是否已设置”的布尔判断即可。

**4. 只读任务仍提示需要审批。** 先确认参数位置：`--ask-for-approval` 是全局参数，要放在 `exec` 子命令之前，放进子命令会被当作未知参数。若位置正确仍无效，说明审批策略没有被你的参数覆盖，或当前版本的参数名不同。执行 `codex --help` 与 `codex exec --help` 核对实际选项；不要为了省事改用 `--dangerously-bypass-approvals-and-sandbox`。后者只适合一次性、可丢弃的隔离环境。

## 验收清单

- [ ] 新终端中 `codex --version` 能输出版本号。
- [ ] `command -v codex` 或 `Get-Command codex` 指向你预期的那一个安装。
- [ ] `codex login status` 退出码为 0，且你知道当前用的是 ChatGPT 还是 API Key。
- [ ] 只读任务返回了项目说明，而不是认证错误或沙箱拒绝。
- [ ] 任务前后 `git status --short` 都没有变化。
- [ ] 遇到 PATH 或登录问题时，能区分“找不到程序”和“凭据不可用”。

## 接下来

装好之后，下一步不是立刻让它改代码，而是用一个有测试的小任务建立验收习惯：先看 [Codex CLI 第一次任务](/articles/codex-first-task/)，再根据任务风险阅读 [Codex 权限模型](/articles/codex-permissions/)。如果你主要在 Windows 上工作，[Windows 下的 Codex 环境](/articles/codex-windows-setup/) 会把 PowerShell 路径、WSL 和换行符的问题单独拆开。

## 参考来源

- [Codex CLI 官方安装与使用](https://learn.chatgpt.com/docs/codex/cli)
- [Codex 认证与登录](https://learn.chatgpt.com/docs/auth)
- [Codex CLI 参数参考](https://learn.chatgpt.com/docs/cli/reference)

核验范围（2026-11-14）：本文对照上述官方页面抓取内容核对安装命令、登录方式、凭据位置和只读参数。版本号、额度与具体计费金额未写死；执行前请以本机 `codex --help`、`codex login --help` 和账号页面为准。