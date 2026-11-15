---
title: "把本地 stdio MCP 服务器接到 Claude Code"
description: "复用自己构建的 wordcount MCP 服务器，选择 local、project 或 user 作用域接入 Claude Code，用 /mcp 检查连接和工具，并守住环境变量与凭据边界。"
category: claude-code
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 150
tags: ["Claude Code", "MCP", "stdio", "工具集成", "配置"]
featured: false
---

## 目标：让一个已知可用的本地服务器出现在会话里

MCP 接入最常见的失败，不是 Claude Code 不支持，而是服务器命令、路径或作用域选错了。本文不引入新的第三方包，也不假设某个远程域名可用；它复用 [从零构建第一个 MCP 服务器](/articles/mcp-first-server/) 里的本地 `wordcount` 服务器，先确认服务本身可运行，再把它接到 Claude Code。

完成后你应该能在 `/mcp` 中看到服务器状态和工具数量，并能让 Claude 调用 `count_words`。如果连接失败，也能沿着“命令—传输—作用域—批准”的顺序定位。

## 前置条件

- 已按 `mcp-first-server` 构建出本地服务器，存在 `build/index.js`，并实现了 `count_words` 工具。
- 已安装并登录 Claude Code。
- Node.js 可用，且 `node` 在 Claude Code 启动时的 PATH 中。
- 知道服务器的绝对路径。不要用 `~` 或相对路径去猜 Claude Code 的工作目录。

## 第一步：先独立确认服务器文件存在

在 Bash 中：

```bash
cd /absolute/path/to/wordcount-server
ls -l build/index.js
node --version
```

预期：文件存在，Node 版本满足项目要求。不要在这一步直接运行 `node build/index.js` 然后等它“输出点什么”；stdio MCP 服务器通常等待 JSON-RPC 输入，看起来像卡住是正常的。若项目提供了测试或 inspector，先用它们验证 `tools/list` 能返回 `count_words`。

## 第二步：选择作用域并接入

Claude Code 支持三种常见作用域：

- `local`：默认，只对当前项目生效，配置保存在用户目录，适合个人试验；
- `project`：写入项目 `.mcp.json`，可提交给团队共享，但需要交互式批准；
- `user`：对所有项目生效，适合你个人长期使用的工具，不适合项目专属依赖。

先以 local 作用域接入：

```bash
claude mcp add --transport stdio wordcount -- node /absolute/path/to/wordcount-server/build/index.js
```

`--` 之后的全部内容原样交给服务器进程；`--transport stdio` 要放在服务器名之前。不要把 Claude 自己的参数写到 `--` 后面，否则它们会变成 Node 的参数。

检查：

```bash
claude mcp list
claude mcp get wordcount
```

预期结果（示意）：`wordcount` 出现在列表中，状态为 Connected；`get` 显示传输方式、命令和作用域。若状态是 Failed to connect，先不要反复删了重加，转到文末的连接诊断。

## 第三步：用项目作用域共享配置

需要团队共用时，可以创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "wordcount": {
      "type": "stdio",
      "command": "node",
      "args": ["${WORDS_SERVER_ENTRY}"]
    }
  }
}
```

`${VAR}` 和 `${VAR:-default}` 会在命令、参数、环境变量、URL 和请求头中展开。变量缺失时 Claude Code 会给出警告，并把字面量保留下来——服务器于是拿到字面量路径，而不是“自动跳过”。启动 Claude Code 的 shell 必须先设好变量，例如：

```bash
# Bash / zsh
export WORDS_SERVER_ENTRY=/absolute/path/to/wordcount-server/build/index.js
```

```powershell
# PowerShell
$env:WORDS_SERVER_ENTRY = "C:\absolute\path\to\wordcount-server\build\index.js"
```

上面两处都是占位符，必须换成你机器上真实存在的绝对路径。`wordcount` 本身不需要任何 token；凭据是另一件事：只有当服务器确实校验 token 时，才用同样的 `${VAR}` 方式引用环境变量，值放在启动 shell 或系统凭据存储里，不写进 `.mcp.json`，也不要为了“看起来完整”加一个用不上的密钥变量。

项目级服务器需要交互式批准；`claude -p` 不会弹出批准提示，而是直接加载项目服务器。若你希望脚本只使用显式指定的配置，可用 `--mcp-config` 配合 `--strict-mcp-config`，避免项目文件悄悄改变工具集合。

## 第四步：在会话里检查并调用

启动 Claude Code：

```bash
claude
```

输入 `/mcp`。预期结果（示意）：面板列出 `wordcount`，状态为 connected，并显示工具数量；进入详情能看到 `count_words`。若显示 0 tools，说明连接建立了，但服务器没有暴露工具，回到服务器实现检查 `tools/list`。

然后发出一个范围明确的任务：

```text
使用 wordcount 服务器的 count_words 工具，统计下面这句话的单词数：
"one two three".
只报告工具返回的数字和原始结果，不要猜测。
```

预期：Claude 调用 `count_words`，返回 3 及工具输出。第一次调用可能要求批准，这是工具权限，不是连接失败。若工具没有出现在可选列表里，先在 `/mcp` 里重连，再检查作用域是否被更高优先级的同名服务器覆盖。

作用域优先级从高到低为 local、project、user、plugin、connector。同名服务器可能同时存在，`claude mcp get wordcount` 会显示当前解析到的那一个；删除时要指定正确的作用域，不要以为删了项目配置就清掉了本地覆盖。

## 常见失败与诊断

**1. 状态为 Failed to connect。** 先看命令是否用了绝对路径，`node` 是否在 PATH；再确认服务器启动时没有把日志写到 stdout。stdio 的 stdout 是 JSON-RPC 通道，任何调试输出混进去都会破坏协议；日志应写 stderr。需要更多信息时用 `claude --debug=mcp` 启动。

**2. 连接成功但 `/mcp` 显示 0 tools。** 服务器可能没有实现 `tools/list`，或工具注册失败。回到 `mcp-first-server` 的最小实现对照；不要靠猜测安装一个“可能是这个包”的第三方服务器来绕过。

**3. 环境变量缺失，路径变成字面量。** 输出里可能出现 `${WORDS_SERVER_ENTRY}` 原样未展开。确认变量在启动 Claude Code 的父 shell 中可见；需要临时注入时，用当前 shell 的环境变量，不要把密钥写进项目文件或命令历史。

**4. 项目服务器在脚本里没生效。** 交互式会话中确认项目服务器已被批准；`claude -p` 会直接加载项目服务器，若使用 `--strict-mcp-config`，确认显式配置已传入。MCP 的加载批准与项目 allow 规则的工作区信任不是同一层，不要混用。

**5. 同名服务器行为不一致。** 用 `claude mcp get <name>` 看来源，按 local/project/user 的优先级判断哪个覆盖了哪个。删除时明确 `--scope`，避免误删其他作用域下的同名配置。

## 验收清单

- [ ] 接入前已确认 `build/index.js` 存在，服务器本身能返回工具列表。
- [ ] `claude mcp list` 中状态为 Connected，`get` 显示的作用域符合预期。
- [ ] `/mcp` 能看到 `count_words`，不是 0 tools。
- [ ] 一次实际调用返回了可核对的结果。
- [ ] 项目 `.mcp.json` 使用变量占位，没有提交真实密钥。
- [ ] 知道 local、project、user 的优先级和删除方式。

## 接下来

如果服务器还没有工具，先回到 [第一个 MCP 服务器](/articles/mcp-first-server/)；想理解工具、资源和传输的关系，读 [MCP 核心概念](/articles/mcp-concepts/)。接入后出现连接或权限问题时，[Claude Code 故障排查](/articles/claude-code-troubleshooting/) 给出了只读检查顺序。

## 参考来源

- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code CLI 参考](https://code.claude.com/docs/en/cli-reference)
- [Claude Code 安装与配置](https://code.claude.com/docs/en/setup)

核验范围（2026-11-14）：作用域、`claude mcp` 子命令、`.mcp.json` 变量展开、项目批准和 `/mcp` 行为依据官方页面核对。示例服务器来自本站教程，不是官方包；命令与状态文字可能随版本变化，执行前以 `claude mcp --help` 和本机 `/mcp` 为准。