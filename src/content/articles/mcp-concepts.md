---
title: "MCP 架构概念：Host、Client、Server 与一次工具调用"
description: "用一次 count_words 调用串起 MCP 的 host、client、server、三类原语与 stdio/远程传输，建立排错前的概念地图。"
category: "mcp"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "入门"
order: 210
tags: ["MCP", "架构", "协议"]
featured: false
faq:
  - q: "Host 和 Server 有什么区别？"
    a: "Host 是你直接使用的 AI 应用，管界面、会话、权限和模型调用；它为每个 server 创建一个 client，client 负责协议消息、请求编号、超时与传输；server 只暴露工具、资源和提示词。"
  - q: "模型会直接连接 MCP server 吗？"
    a: "不会。模型只产生一次工具选择，由 host 判断是否允许执行，client 才把调用请求发给 server。所以工具没出现时，先查 host 侧的连接配置，而不是反复重启 server。"
  - q: "tools/list 为空先查什么？"
    a: "先查 server 侧的工具注册代码：注册顺序、条件分支和能力声明都可能让注册被跳过。若进程直接退出，则回到启动命令、工作目录、环境变量和依赖去查。"
---

很多 MCP 教程从一行配置开始，照着粘贴能跑，但一旦工具没出现或调用超时，就不知道应该查进程、查协议还是查业务代码。原因通常不是某个 SDK 方法记错了，而是把 host、client、server 三个角色混成了一个“服务”。先把这张地图画清楚，后面的 first-server、工具设计和 Inspector 排错才有落点。

## 前置条件

- 见过一份 MCP server 配置，知道命令、参数和环境变量分别填在哪里。
- 能在终端启动本地进程，并区分 stdout 与 stderr。
- 不需要先读 SDK 源码；本文不要求已经安装 server。

## 三个角色：谁在替模型连接

**Host** 是用户直接使用的 AI 应用，例如 IDE 插件、桌面聊天客户端或你自己的 Agent 程序。它拥有界面、会话、权限策略和模型调用，决定“允不允许这次工具调用”。Host 不直接和某个 server 绑定，而是为每个 server 创建一个 **client**。

**Client** 是一条专用连接，负责把 host 的意图翻译成协议消息，处理能力协商、请求 id、超时和传输。一个 host 可以同时拥有多个 client；本地 stdio server 通常是一对一，远程 Streamable HTTP server 可以被多个 client 连接。

**Server** 是上下文提供方，可以是本机子进程，也可以是远端服务。它暴露工具、资源和提示词，但不拥有模型，也不应该替 host 决定用户权限。把 server 当成“带 schema 的函数集合”比当成“另一个 Agent”更准确。

```text
用户 → Host（界面、权限、模型）
          ├─ Client A ⇄ stdio Server（本地文件/数据库）
          └─ Client B ⇄ HTTP Server（远端 API）
```

这张图解释了一个常见误会：模型并不直接“连 server”。模型只产生一个工具选择，host 决定是否执行，client 才把 `tools/call` 发给 server。

## 两层协议：数据层与传输层

MCP 分为数据层和传输层。数据层使用 JSON-RPC 2.0，负责发现能力、列出原语、调用工具和发送通知；传输层负责消息怎么在两端之间走。stdio 用标准输入输出传消息，适合本地进程；Streamable HTTP 用 HTTP POST，必要时配合 SSE，适合远程服务，并涉及 bearer token、API key 或 OAuth 等认证方式。

分层带来的直接好处是排错可以分开：JSON 解析失败通常是传输层或 stdout 污染；`tools/list` 为空通常是 server 注册或能力协商；`tools/call` 返回业务错误则是工具实现。不要把三类问题都归因于“模型不会用工具”。

## 三种 server 原语

| 原语 | 谁决定使用 | 典型方法 | 例子 |
| --- | --- | --- | --- |
| Tools | 模型选择，host 授权 | `tools/list`、`tools/call` | 统计字数、查询工单 |
| Resources | 应用选择并注入上下文 | `resources/list`、`resources/read` | 数据库 schema、项目说明 |
| Prompts | 用户选择 | `prompts/list`、`prompts/get` | 代码审查模板、发布检查清单 |

工具是“可执行动作”，资源是“可读取的上下文”，提示词是“可复用的交互模板”。把只读文件硬做成工具，会让模型多一次选择；把有副作用的操作伪装成资源，则绕过了授权。这个边界在 [MCP 的安全与信任边界](/articles/mcp-boundaries/) 里有更完整的讨论。

## 一次请求的完整旅程

假设用户在 host 里说“统计 hello mcp world 有几个词”。一次最小旅程如下：

1. Host 收到请求，确认当前会话连接了 `count_words` 所在的 server。
2. Client 已经通过发现流程知道 server 的能力和工具列表；若列表是动态的，它会在需要时刷新。
3. Host 把可用工具的名称、描述和输入 schema 交给模型。模型选择 `count_words`，生成参数 `{"text":"hello mcp world"}`。
4. Host 执行自己的策略：这个用户能否调用该工具、参数是否超过限制、是否需要确认。
5. Client 发送 JSON-RPC 请求：

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"count_words","arguments":{"text":"hello mcp world"}}}
```

6. Server 校验参数，执行纯函数，返回内容数组：

```json
{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\"words\":3,\"characters\":15,\"lines\":1}"}]}}
```

7. Host 解析结果并渲染给用户。模型看到的是工具结果，不是 server 的内部日志。

在 2026-07-28 的协议版本里，流程更偏向无状态：每个请求在 `_meta` 中携带协议版本、客户端信息和能力，server 必须支持 `server/discover`，客户端可以用它获取支持的版本、能力和 server 信息。较早的客户端和 SDK 仍可能使用 `initialize` 生命周期。两者概念相通，但字段不能混用；排错时先确认双方谈的是哪一套握手。

## stdio 与远程：故障面不同

stdio server 是一个本地进程。它的 stdout 只能输出协议消息，日志必须走 stderr；工作目录、环境变量、Node 版本和启动命令都会影响它能否找到依赖。远程 server 多了网络、DNS、TLS、认证和限流，`initialize` 成功也不代表后续每个请求都被授权。

因此，“server 启动了吗”和“工具能用吗”是两个问题。前者看进程和 stderr，后者看发现、列表和调用。把这两件事混在一起，最容易在错误的层面反复重启。

## 排错责任表

| 现象 | 先查什么 | 主要责任方 |
| --- | --- | --- |
| 进程立即退出 | 启动命令、cwd、环境变量、依赖 | server 运行环境 |
| 进程在但 client 报解析错误 | stdout 是否混入日志 | server 日志实现 |
| `initialize` 失败 | 协议版本、认证、URL | client/server 握手 |
| `tools/list` 为空 | 注册顺序、条件分支、能力声明 | server 注册代码 |
| `tools/call` 返回错误 | 参数、授权、上游依赖 | 工具 handler 与 host 策略 |

这张表也是后续文章的路线：[从零启动第一个 MCP server](/articles/mcp-first-server/) 处理进程和注册，[MCP 工具设计](/articles/mcp-tool-design/) 处理契约，Inspector 排错则把四层逐一验证。

## 验收标准

读完这一篇，你应该能不看资料画出 host、client、server 和三种原语的关系；能解释为什么模型不直接连接 server；能拿到一个失败请求时，先判断它卡在进程、握手、列表还是调用层。若只能背出“MCP 是协议”，说明地图还没建立。

## 常见错误与诊断

- **把所有连接都叫 server**：看到“客户端连不上”就去重启 server，但真正失败的是 host 里的 client 配置。先确认报错发生在哪一侧。
- **把资源当工具**：模型能“读”文件却出现在 `tools/list` 里，说明设计时选错了原语；只读上下文优先考虑 resource。
- **stdio 日志写到 stdout**：任何 `console.log` 都可能让 client 收到非 JSON 文本，典型报错是 `Unexpected token`；日志改到 stderr。
- **忽略协议版本**：新 server 只实现 `server/discover`，旧 client 只发 `initialize`，双方都“正常启动”却无法对话；先对齐版本和握手方式。

## 参考来源

- MCP Architecture（2026-07-28 版）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- MCP Inspector：https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector

官方资料核对日期：2026-11-14。文中请求与响应为说明用示意，未连接真实 server 执行。