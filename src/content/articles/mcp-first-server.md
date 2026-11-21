---
title: "写第一个 MCP Server：stdio 工具、Inspector 验证与注册"
description: "用当前官方 SDK 写一个只做一件事的 MCP server，用 Inspector 验证协议层，再分别注册到 Claude Code 和 Codex，最后确认工具真的被调用而不是只在列表里出现。"
category: mcp
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 230
tags: ["MCP", "Node.js", "stdio", "SDK"]
featured: false
faq:
  - q: "写第一个 MCP server 要什么准备？"
    a: "Node.js 20 或更高、基本的 TypeScript 经验，并已安装 Claude Code 或 Codex 之一。第一个工具选输入输出确定、无副作用的纯函数，出问题时才能分清是协议没通还是逻辑写错。"
  - q: "sdk 包和 server 包能混用吗？"
    a: "别混用。当前官方文档用 server 包配合 serveStdio，字段和入口都与旧教程的 sdk 包加 StdioServerTransport 不同，照抄会得到启动报错，或者连上了却看不到工具。"
  - q: "工具出现在列表里就算成功了吗？"
    a: "只是注册成功。要真正触发一次调用并核对返回值，才算调用链通了；注册客户端时路径必须写绝对路径，改完 TypeScript 还要重新构建，否则跑的还是旧文件。"
---

## 目标：从“配置别人的 server”到“自己能写一个”

第一个 server 不要做数据库、不要做 shell。选一个**输入输出都确定、无副作用**的工具：统计一段文本的词数、字符数和行数。这样出问题时你能立刻区分是协议没通还是逻辑写错。

完成标志：Inspector 能列出工具并调用成功，Claude Code 和 Codex 都能在对话中实际调用它，返回结果与你手算一致。

## 前置条件

- Node.js 20 或更高（官方文档明确要求）
- 基本的 TypeScript 使用经验
- 已安装 Claude Code 或 Codex 其中之一

本文示例的实测环境：Node.js 24.11.0、`@modelcontextprotocol/server` 2.4.0、TypeScript 7.0.2、Inspector CLI（`@modelcontextprotocol/inspector`）。下文标注“实测输出”的片段来自这次运行；没有标注的部分是按官方文档写的最小骨架，未验证过。

## 步骤一：初始化项目

```bash
mkdir wordcount-mcp && cd wordcount-mcp
npm init -y
npm install @modelcontextprotocol/server zod
npm install -D typescript @types/node
```

包名注意：当前官方文档使用 `@modelcontextprotocol/server`，配合 `@modelcontextprotocol/server/stdio` 里的 `serveStdio`（实测 2.4.0 确实导出了 `./stdio` 子路径）。网上很多旧教程用 `@modelcontextprotocol/sdk` 加 `server.connect(new StdioServerTransport())`，包名和入口都不一样；照抄会得到启动报错或“连上了但工具不出现”的结果。**以官方文档当前的写法为准，不要混用两代 API。**

`package.json` 里声明 ESM 与构建脚本，`tsconfig.json` 里指定根目录与 Node 类型：

```json
{
  "type": "module",
  "scripts": { "build": "tsc" }
}
```

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2022",
    "rootDir": "src",
    "outDir": "build",
    "strict": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

这三项看着繁琐，缺了都会报错（实测）：

- 缺 `rootDir` → `error TS5011: The common source directory of 'tsconfig.json' is './src'. The 'rootDir' setting must be explicitly set`（TypeScript 7 起强制要求，5.x 可容忍）
- 缺 `types: ["node"]` → `error TS2591: Cannot find name 'Buffer'. Do you need to install type definitions for node?`
- 缺 `"type": "module"` → 运行时报 `SyntaxError: Cannot use import statement outside a module`

## 步骤二：写 server

`src/index.ts`：

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// serveStdio 会多次调用这个工厂，每次都返回全新实例
function createServer() {
  const server = new McpServer({ name: "wordcount", version: "1.0.0" });

  server.registerTool(
    "count_words",
    {
      description: "统计一段文本的词数、字符数和行数",
      inputSchema: z.object({
        text: z.string().max(20_000).describe("要统计的文本"),
      }),
    },
    async ({ text }) => {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              words,
              characters: [...text].length,
              lines: text.split("\n").length,
            }),
          },
        ],
      };
    },
  );

  return server;
}

serveStdio(createServer, {
  onerror: (error) => console.error("wordcount error:", error),
});
console.error("wordcount MCP server 已在 stdio 上启动");
```

三个容易踩的点：

1. **绝不 `console.log`**。stdio 传输把 stdout 当成 JSON-RPC 通道。实测在 `serveStdio` 前加一行 `console.log("starting server")`，客户端立刻挂在 `SyntaxError: Unexpected token 's', "starting server" is not valid JSON`。日志一律走 `console.error`。
2. **用工厂函数返回新实例**。`serveStdio(createServer, …)` 要求传入的是“能创建 server 的函数”，不是已创建好的实例；每次返回新对象，避免会话状态互相污染。
3. **返回值必须是 `content` 数组**。数据再放进 `text` 字段，序列化成字符串（本例是 JSON）。

## 步骤三：用 Inspector 验证协议层

```bash
npm run build
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list
```

实测输出（节选）：

```json
{
  "tools": [
    {
      "name": "count_words",
      "description": "统计一段文本的词数、字符数和行数",
      "inputSchema": {
        "type": "object",
        "properties": { "text": { "type": "string", "maxLength": 20000 } },
        "required": ["text"]
      }
    }
  ]
}
```

注意 `inputSchema` 是由 zod 自动转出来的 JSON Schema：`max(20_000)` 变成了 `maxLength: 20000`。再调用一次：

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js \
  --method tools/call --tool-name count_words --tool-arg text="hello mcp world"
```

实测返回：

```json
{ "content": [ { "type": "text", "text": "{\"words\":3,\"characters\":15,\"lines\":1}" } ] }
```

`--cli` 模式常用参数（来自 `npx @modelcontextprotocol/inspector --cli --help`）：`--method`、`--tool-name`、`--tool-arg key=value`、`--cwd`、`-e KEY=VALUE`、`--transport`。加上 `--strict` 还会检查工具 schema 的可移植性问题。

如果 `tools/list` 正常但调用报参数错误，问题在 schema；如果客户端根本连不上，先看 stdout 有没有脏输出。

## 步骤四：注册到客户端

Claude Code（本地 stdio，路径必须是绝对路径）：

```bash
claude mcp add wordcount --transport stdio -- node /absolute/path/wordcount-mcp/build/index.js
claude mcp list
```

Codex：

```bash
codex mcp add wordcount -- node /absolute/path/wordcount-mcp/build/index.js
```

Codex 会把它写入 `~/.codex/config.toml` 的 `[mcp_servers.*]` 表；Claude Code 默认写入 local 作用域（`~/.claude.json`），加 `--scope project` 则写进 `.mcp.json` 供团队共享。

或者用配置文件（Claude Code 的 `.mcp.json`）：

```json
{
  "mcpServers": {
    "wordcount": {
      "command": "node",
      "args": ["/absolute/path/wordcount-mcp/build/index.js"]
    }
  }
}
```

## 步骤五：确认真被调用

在会话里说一句必须用工具才能答对的话：

```text
用 count_words 统计这段文本：'one two three four'，然后告诉我词数。
```

验收信号有两个层次：**工具出现在列表里**只是注册成功；**返回 4** 才说明调用链通了。如果它“凭记忆”回答了 4 而没调工具，换一个它猜不出的输入：

```text
统计这段文本的词数并只返回 JSON：'alpha beta gamma delta epsilon zeta'
```

## 验收标准

1. Inspector 的 `tools/list` 能看到 `count_words`，`tools/call` 返回 `{"words":3,"characters":15,"lines":1}`；
2. `claude mcp list` 或 Codex 的配置里能看到该 server，且状态是已连接；
3. 会话中一次真实调用返回正确数目，轨迹里能看到工具调用记录；
4. stdout 中没有任何非 JSON-RPC 输出（`node build/index.js < /dev/null` 只应看到 stderr 的启动日志）；
5. 传入超过 20k 字符的文本时，得到 `Input validation error: ... Too big: expected string to have <=20000 characters` 且 `isError: true`，进程不崩溃。

## 常见错误

- **用相对路径注册**。客户端的工作目录不是你的项目目录，找不到文件。
- **忘了 `npm run build`**。改了 TS 没编译，跑的还是旧 JS。
- **用 `console.log` 调试**。会直接破坏 stdout 上的 JSON-RPC 流，报的是 JSON 解析错误，很容易往别处查。
- **tsconfig 少了 `rootDir` 或 `types: ["node"]`**。TypeScript 7 上分别报 TS5011 和 TS2591。
- **混用两代 SDK API**。`@modelcontextprotocol/sdk` 的 `StdioServerTransport` 与本文的 `serveStdio` 不是同一套入口。
- **只验证列表不验证调用**。参数 schema 写错时列表照样正常，调用才暴露问题。

写完 server 一定要回头看信任边界：这个进程拥有你的用户权限，[/articles/mcp-boundaries/](/articles/mcp-boundaries/) 说明了哪些能力不该轻易接。想把重复流程固化成技能而非工具，见 [/articles/skills-design/](/articles/skills-design/)。

## 参考来源

- 构建 MCP server（当前 SDK 用法、`serveStdio`、工具注册、Inspector 命令）：<https://modelcontextprotocol.io/docs/develop/build-server>
- 协议生命周期与版本协商：<https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle>
- Claude Code MCP 命令与作用域：<https://code.claude.com/docs/en/mcp>
- Codex MCP 配置（`codex mcp add`、`~/.codex/config.toml`）：openai/codex 仓库 `codex-rs/cli/src/mcp_cmd.rs`
- 本文代码已在 Node.js 24.11.0 + `@modelcontextprotocol/server` 2.4.0 + TypeScript 7.0.2 上实际编译、启动，并用 Inspector CLI 完成 `tools/list`、`tools/call` 与超长输入校验；客户端注册（`claude mcp add` / `codex mcp add`）与 IDE 内调用未实测
