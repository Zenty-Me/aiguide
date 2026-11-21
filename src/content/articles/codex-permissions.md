---
title: "Codex 权限：沙箱和审批是两个开关"
description: "把 Codex 的沙箱边界和审批策略分开理解，用只读与工作区写入两组任务观察拒绝行为，并学会从路径、网络和保护目录三个方向诊断权限失败。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 30
tags: ["Codex", "权限", "沙箱", "审批", "安全"]
featured: false
setupNote: true
---

## 目标：先分清“能不能做”和“要不要问”

Codex 的权限常被当成一个“放松/严格”的滑块，实际上它有两层：沙箱决定进程能碰什么，审批策略决定什么时候停下来问人。只调其中一层，往往得到相反的结果：沙箱是只读，却不断弹审批；或者审批全关，却仍然写不进项目。

本文用两组任务分别观察这两层，最后给出拒绝发生时的排查顺序。目标不是找到“最宽松的配置”，而是让每次放权都有明确理由。

## 前置条件

- 已安装并登录 Codex CLI。
- 一个可以随便折腾的 Git 仓库，至少有一次提交。
- 知道当前终端是 Bash、PowerShell 还是 WSL 中的某一个。**后文的命令按 Bash 语法书写**：`\` 续行、`test -e`、`&&` 与 `||`。PowerShell 不能原样粘贴，续行用反引号，判断用 `Test-Path`；不熟悉 Bash 时建议在 WSL 或 Git Bash 中跟做。

## 第一步：在会话里看清当前策略

启动一个只读会话：

```bash
cd ~/code/scratch-repo
codex --sandbox read-only
```

进入后执行斜杠命令：

```text
/status
/permissions
```

`/status` 用来确认当前模型、目录和沙箱状态，`/permissions` 用来查看或切换权限设置。不同版本的界面文字会变化，但这两个入口足以回答“我现在处于哪一层”。不要只看启动参数：配置文件和命令行参数都可能影响最终值。

## 第二步：只读沙箱下尝试一次写入

退出会话，用非交互模式发一条明确要求写文件的任务：

```bash
codex --ask-for-approval never exec --sandbox read-only \
  "在项目根目录创建 probe.txt，内容写 hello，然后报告结果。"
```

预期结果（示意）：Codex 可能说明无法写入，也可能只给出建议；无论它怎么措辞，执行后检查：

```bash
test -e probe.txt && echo "unexpected" || echo "not created"
git status --short
```

文件不应出现。这里的关键不是“模型拒绝了”，而是沙箱在系统层面阻止了写入。模型的解释只是旁证，文件系统状态才是证据。

PowerShell 等价检查（期望 `False`）：

```powershell
Test-Path probe.txt
```

`--ask-for-approval never` 只适合这种明确只读的任务。它不会把沙箱变宽，只是不再停下来询问；把它和 `workspace-write` 组合用于无人值守的写任务，就等于放弃了人工确认。

## 第三步：工作区写入需要同时选对目录和策略

在交互会话中允许修改当前工作区：

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

然后给出一个边界清晰的任务：

```text
只修改 src/greet.js，把 greeting 改成可配置参数；
不要改测试，不要新增依赖；修改后运行 npm test 并展示 git diff。
```

预期行为（示意）：Codex 读取文件、提出修改；涉及命令执行或越界写入时，可能按审批策略暂停，等待你确认。确认前先看它要执行的具体命令和路径，不要习惯性一路同意。

`workspace-write` 的“工作区”通常指启动目录及其可写范围，不是整块磁盘。即使在这个模式下，`.git`、`.agents`、`.codex`、`.aws` 等目录仍受保护，避免代理改写仓库元数据或凭据。需要写这些位置时，先问自己是不是任务真的需要；多数情况下应该改任务，而不是改保护规则。

网络默认也是关闭的。若任务确实要下载依赖或访问接口，可在配置中显式打开：

```toml
[sandbox_workspace_write]
network_access = true
```

这行配置会扩大攻击面。只对可信项目、可信任务开启，并在任务结束后恢复；不要把它写进全局配置当成默认值。

## 第四步：故意制造一次拒绝

在 `workspace-write` 会话中要求写仓库元数据：

```text
把当前分支名写入 .git/probe.txt。
```

预期结果（示意）：操作被拒绝，或模型在尝试前就说明该路径受保护。检查 `.git/probe.txt` 不存在。这个练习的价值是建立预期：拒绝不等于配置坏了，有时是保护机制正常工作。

再尝试访问工作区外的路径，例如用户主目录下的文件。预期同样是被拒绝或要求审批。若你确实需要跨目录工作，优先把任务目录设为项目根，而不是给整个主目录写权限。

## 常见失败与诊断

**1. 明明用了 `workspace-write`，写文件仍失败。** 先看目标路径是否在启动目录内，再看是否落在保护目录。用 `pwd` 和 `git rev-parse --show-toplevel` 确认工作区根；不要用 `chmod` 或改 `.git` 权限来“修复”。

**2. 任务一直等待审批，非交互脚本卡住。** 非交互环境没有人点确认。只读任务可以配 `--ask-for-approval never`；需要写入时，改用交互会话，或把任务拆成可审计的只读步骤。不要为了跑通脚本直接上 `--dangerously-bypass-approvals-and-sandbox`。

**3. 命令报网络不可达。** 这是沙箱默认禁网，不是 DNS 坏了。确认任务是否真的需要网络；需要时只对当前项目开启 `network_access`，并检查代理和证书配置。不要用关闭 TLS 校验来绕过。

**4. 审批策略看起来没生效。** 用 `/status` 看最终状态，检查项目配置和用户配置是否覆盖了启动参数。参数名以 `codex --help` 为准；旧脚本里的开关可能已经改名。

**5. 想临时全开权限。** `danger-full-access` 和跳过审批只适合一次性、可丢弃、没有真实凭据的隔离环境。日常项目里，正确做法是缩小任务范围，而不是扩大权限。

## 验收清单

- [ ] 能用自己的话解释沙箱和审批分别控制什么。
- [ ] 只读任务没有创建 `probe.txt`，任务前后 `git status` 无变化。
- [ ] `workspace-write` 任务只改了指定文件，测试结果和 diff 都经过检查。
- [ ] 知道 `.git` 等目录为何受保护，没有尝试关闭保护。
- [ ] 网络访问是按任务临时开启的，不是全局默认。
- [ ] 没有把 `danger-full-access` 当作常规排错手段。

## 接下来

权限边界清楚后，可以用一个失败测试练习“限定改动”：[让 Codex 修一个失败的测试](/articles/codex-debugging-tests/)。如果你要把 Codex 放进脚本，先读 [非交互模式](/articles/codex-noninteractive/)，那里会解释退出码和审批在无人值守场景下的差异。第一次使用 Codex 的话，先完成 [第一条任务](/articles/codex-first-task/)。

## 参考来源

- [Codex 沙箱与审批](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Codex 配置参考](https://learn.chatgpt.com/docs/configuration)
- [Codex CLI 参数参考](https://learn.chatgpt.com/docs/cli/reference)

核验范围（2026-11-14）：沙箱模式、保护目录、网络默认值和审批策略依据上述官方页面核对。界面文字、参数名和默认值可能随版本变化；执行前用 `codex --help`、`/status` 和 `/permissions` 确认本机行为。