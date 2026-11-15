---
title: "MCP 协议排错：从进程启动到 tools/call 的四层定位"
description: "用 Inspector CLI 把 MCP 故障拆成进程、握手、tools/list、tools/call 四层，覆盖 stdout 污染、cwd、环境变量与 schema 问题。"
category: "mcp"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 250
tags: ["MCP", "Inspector", "调试"]
featured: false
---

MCP 报错最容易被归因成“模型不会调用工具”，但真实故障往往发生在更早的层：进程根本没起来、握手版本不一致、工具没注册、参数校验失败。把排错拆成四层，每层只回答一个问题，能避免在错误的层面反复改配置。本文使用官方 Inspector CLI 的命令，命令来自 2026-07-28 文档；本机没有安装依赖，也未连接真实 server，输出均标为示意。

## 前置条件

- Node.js 22.19.0 或更高版本；Inspector 官方要求这个下限。
- 一个可启动的 stdio server，例如 [第一个 MCP server](/articles/mcp-first-server/) 的 `build/index.js`；概念层可先读 [MCP 架构](/articles/mcp-concepts/)。
- 首次运行 `npx @modelcontextprotocol/inspector` 会下载包，需要网络；本文不执行安装或 API 调用。
- 不要用生产凭据做调试。Inspector 会尝试把 OAuth token 和环境值存入系统钥匙串；无钥匙串时会落到 `~/.mcp-inspector/secrets.json`，官方明确提示该文件未加密。

## 第 0 层：进程真的在运行吗

先绕开 Inspector，直接启动 server：

```bash
node build/index.js
```

一个正常的 stdio server 启动后通常**不会退出**，而是在 stdin 上等待 JSON-RPC 消息；没有输出也是正常的。观察 stderr 是否有启动日志，然后按 Ctrl+C 结束。若命令立即退出，先查三件事：当前目录是否正确、`build/index.js` 是否存在、依赖是否安装。相对路径是相对 shell 的当前目录，不是相对 server 源码目录。

这一层失败的典型证据是 `MODULE_NOT_FOUND`、`ENOENT` 或端口占用。它和 MCP 协议无关，先修运行环境，不要继续看 Inspector 的报错。

## 第 1 层：握手成功了吗

用 Inspector CLI 做一次只连接、不列工具的探测：

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --method initialize
```

成功时返回 server 信息、协议版本和能力，示意如下：

```json
{
  "serverInfo": { "name": "aiguide-demo", "version": "0.1.0" },
  "protocolVersion": "2026-07-28",
  "capabilities": { "tools": {} }
}
```

失败时先看退出码：`3` 表示需要认证，`4` 表示不可达。CLI 的非零退出会在 stderr 写一行 JSON，例如 `{"error":{"code":"unreachable","message":"..."}}`。这说明连接层没通，查 URL、启动命令、传输方式和认证，而不是查工具描述。

2026-07-28 版本还使用 `server/discover` 做能力发现；较早的客户端和 SDK 可能走 `initialize` 生命周期。两者概念相近但字段不同。Inspector 的 `initialize` 探测仍能告诉你进程是否可连接，但如果 server 只实现新握手，或客户端只发旧握手，可能出现“进程在、能力却对不上”。先确认双方支持的协议版本，再判断是谁的实现有问题。

## 第 2 层：工具注册了吗

握手通过后，列出工具：

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list --format json
```

预期能看到工具名、描述和输入 schema，示意：

```json
{
  "tools": [
    {
      "name": "count_words",
      "description": "Count words, characters, and lines in a short plain-text string.",
      "inputSchema": {
        "type": "object",
        "properties": { "text": { "type": "string", "maxLength": 20000 } },
        "required": ["text"]
      }
    }
  ]
}
```

如果列表为空，先查注册代码是否真的执行：条件分支、feature flag、异步初始化顺序都可能让注册被跳过。再查 server 是否声明了 `tools` 能力。描述或 schema 不对，则进入 [MCP 工具设计](/articles/mcp-tool-design/) 的范围。

需要检查 schema 的可移植性时，加 `--strict`：

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list --strict
```

`--strict` 在发现 error 级别的 schema 可移植性问题时以退出码 `6` 结束。正确做法是根据提示缩小 schema，而不是去掉 strict 后宣称通过。退出码 `6` 是检查结果，不是网络故障。

## 第 3 层：调用成功了吗

最后发起一次真实调用：

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js \
  --method tools/call \
  --tool-name count_words \
  --tool-arg text="hello mcp world" \
  --format json
```

`--tool-arg key=value` 会把值做 JSON 转换，适合简单参数；参数复杂时用 `--tool-args-json '{"text":"hello mcp world"}'` 传完整对象，避免 shell 引号层数过多。成功结果示意：

```json
{
  "content": [
    { "type": "text", "text": "{\"words\":3,\"characters\":15,\"lines\":1}" }
  ]
}
```

若工具返回 `isError: true`，Inspector 仍会打印结果，但进程以 `5` 退出。这是**工具错误**，不是连接失败：参数越界、业务拒绝、上游超时都可能走到这里。读 payload 里的 code，不要只看退出码。退出码 `5` 也可能是工具名根本不存在，此时先回到第 2 层核对名称。

## 常见根因：stdout、cwd、env、schema

**stdout 污染**。stdio 的 stdout 是协议通道，任何 `console.log("starting server")` 都会让客户端收到非 JSON 文本。已有示例里出现过 `SyntaxError: Unexpected token 's', "starting server" is not valid JSON`，就是这类问题。日志统一走 `console.error`，并确保第三方库也不往 stdout 打印。

**cwd 与相对路径**。`node build/index.js` 能找到入口，不代表 server 运行时的文件读取路径正确。Inspector CLI 提供 `--cwd` 指定工作目录；更简单的做法是先从项目根目录启动并验证。若工具读取 `./data/...`，把路径写成相对 server 自己的资源目录，或显式从环境变量取绝对路径。

**环境变量缺失**。缺 key 时 `tools/list` 可能正常，因为注册不需要调用上游；到 `tools/call` 才失败。用 `-e KEY=VALUE` 注入调试值，不要在生产日志里打印 env。不要把真实 token 写进命令历史、截图或文章。

**schema 可移植性**。本地 SDK 接受的 schema，换客户端后可能不被支持。`--strict` 的退出码 `6` 就是提醒；把 schema 缩到常见 JSON Schema 子集，必要时在 server 侧做二次校验。

## 安全地记录日志

调试日志只需要能定位层，不需要复述用户输入。推荐记录方法名、工具名、耗时、结果状态和稳定错误码：

```js
console.error(JSON.stringify({
  event: "tools/call",
  tool: "count_words",
  durationMs: 12,
  outcome: "error",
  errorCode: "TEXT_TOO_LONG",
}));
```

不要记录完整 arguments、Authorization header、cookie、env 或上游响应体。即使日志只进 stderr，它仍可能被 host 收集、上传或截图。需要关联请求时，记录截断的请求 id，而不是原始文本。

## 验收标准

- 能独立判断故障发生在进程、握手、列表还是调用层。
- 能用 `--method initialize`、`tools/list`、`tools/call` 三条命令复现并定位。
- 看到退出码 `3/4/5/6` 能说出对应层面，而不是统一重启。
- stdout 只有协议消息；日志可从 stderr 安全读取。
- 排错记录不包含 token、cookie 或完整用户输入。

## 常见错误与诊断

- **Inspector 报 JSON 解析失败，但直接运行 server 没事**：说明 server 在 stdout 打了日志，或包装脚本 echo 了内容；检查所有 `console.log` 和启动脚本。
- **`tools/list` 有工具，`tools/call` 报工具不存在**：名称有拼写/大小写差异，或列表是动态的而调用时条件变了；用 `--format json` 对照精确名称。
- **本地能调用，CI 里 `unreachable`**：路径、cwd、Node 版本或环境变量不同；先在 CI 里打印**非敏感**的版本和路径，再跑 initialize。
- **`--strict` 退出 6，普通模式能过**：schema 使用了目标客户端不支持的写法；按报告缩小 schema，不要删除 strict 掩盖问题。
- **工具返回 `isError` 却以为协议坏了**：退出码 5 是工具层错误；读 payload 的 code 和 message，再决定改参数还是改实现。

## 参考来源

- MCP Inspector（2026-07-28 版）：https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector
- MCP Inspector CLI（2026-07-28 版）：https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli
- MCP Architecture（2026-07-28 版）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture

官方资料核对日期：2026-11-14。Inspector 命令按官方文档整理，本次未安装或执行；所有输出均为示意，不代表本机实测。