---
title: "Agent 工具契约：输入、授权、错误与输出校验"
description: "用一个可离线运行的工单查询工具，拆开输入校验、独立授权、结构化业务错误和输出契约，并跑通九条断言。"
category: "agent"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 420
tags: ["AI Agent", "工具调用", "JSON Schema"]
featured: false
---

工具调用最常见的失败，不是模型不会调，而是工具“能调但不可信”：参数少传一个字段就抛未捕获异常，把别人的工单返回给当前用户，失败时返回一段 HTML，或者输出结构悄悄变了，模型还照着旧字段编。本文用一个不依赖任何 SDK、可离线运行的工单查询工具，把契约拆成四层：输入校验、授权、业务错误语义、输出校验。示例只使用 Node 内置模块，九条断言覆盖成功与失败路径。

## 前置条件

- Node.js 20 或更高版本；本文用 v24.11.0 实际运行。
- 不需要安装依赖，也不需要模型 API；把代码保存为 `read-ticket.mjs` 后直接 `node` 运行。
- 已理解工具名、描述和输入 schema 的基本设计，建议先读 [MCP 工具设计](/articles/mcp-tool-design/)；循环结构见 [Agent 工具循环](/articles/agent-tool-loop/)，失败排查见 [Agent 运行追踪](/articles/agent-tracing/)。
- 知道“当前用户”应由宿主注入，而不是由模型在参数里填写。

## 四层契约

| 层 | 回答的问题 | 失败时返回 |
| --- | --- | --- |
| 输入校验 | 参数形状、类型、范围是否合法？ | `INVALID_ARGUMENT` |
| 授权 | 这个调用者是否有权对这个资源做这件事？ | `FORBIDDEN` / `NOT_FOUND` |
| 业务语义 | 资源不存在、状态冲突、暂时不可用分别怎么处理？ | 稳定的错误码 |
| 输出校验 | 工具返回的结构是否仍符合调用方预期？ | `INTERNAL`，不泄露细节 |

JSON Schema 能描述前者的形状，但不能决定“当前用户能不能看内部备注”。把授权写进 schema 的 `enum` 或默认值，是把权限交给了调用方。

## 完整示例

```js
import assert from "node:assert/strict";

// The authenticated viewer is injected by the host, never read from tool arguments.
const TICKETS = new Map([
  [
    "TCK-101",
    {
      id: "TCK-101",
      title: "Export fails on an empty CSV",
      status: "open",
      team: "platform",
      comments: ["Reporter: export button returns a blank file."],
      internal: ["Escalated to the platform on-call."],
    },
  ],
  [
    "TCK-102",
    {
      id: "TCK-102",
      title: "Billing address label is truncated",
      status: "closed",
      team: "billing",
      comments: ["Fixed in the invoice template."],
      internal: [],
    },
  ],
]);

class ToolError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateInput(args) {
  if (!isPlainObject(args)) {
    throw new ToolError("INVALID_ARGUMENT", "arguments must be an object");
  }
  const allowed = new Set(["id", "includeInternal"]);
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ToolError("INVALID_ARGUMENT", `unknown field: ${unknown.join(", ")}`);
  }
  if (typeof args.id !== "string" || !/^TCK-\d{3}$/.test(args.id)) {
    throw new ToolError("INVALID_ARGUMENT", "id must match TCK-123");
  }
  if ("includeInternal" in args && typeof args.includeInternal !== "boolean") {
    throw new ToolError("INVALID_ARGUMENT", "includeInternal must be boolean");
  }
}

function validateOutput(value) {
  if (!isPlainObject(value)) throw new Error("output must be an object");
  if (typeof value.id !== "string" || !/^TCK-\d{3}$/.test(value.id)) {
    throw new Error("output.id is invalid");
  }
  if (typeof value.title !== "string" || value.title.length === 0) {
    throw new Error("output.title is invalid");
  }
  if (!["open", "closed"].includes(value.status)) {
    throw new Error("output.status is invalid");
  }
  if (!Array.isArray(value.comments) || !value.comments.every((item) => typeof item === "string")) {
    throw new Error("output.comments is invalid");
  }
  if (
    "internalComments" in value &&
    (!Array.isArray(value.internalComments) ||
      !value.internalComments.every((item) => typeof item === "string"))
  ) {
    throw new Error("output.internalComments is invalid");
  }
  return value;
}

export function readTicket({ viewer, args, store = TICKETS }) {
  try {
    validateInput(args);
    const ticket = store.get(args.id);
    if (!ticket) {
      throw new ToolError("NOT_FOUND", "ticket not found");
    }
    // Do not reveal whether another team's ticket exists.
    if (ticket.team !== viewer.team) {
      throw new ToolError("NOT_FOUND", "ticket not found");
    }
    // Schema validation cannot decide whether this viewer may see internal notes.
    if (args.includeInternal && viewer.role !== "lead") {
      throw new ToolError("FORBIDDEN", "internal comments require the lead role");
    }
    const data = {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      comments: ticket.comments,
    };
    if (args.includeInternal) data.internalComments = ticket.internal;
    return { ok: true, data: validateOutput(data) };
  } catch (error) {
    if (error instanceof ToolError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message, retryable: error.retryable },
      };
    }
    // Unexpected failures are logged internally; the caller gets no stack or store details.
    return { ok: false, error: { code: "INTERNAL", message: "tool failed", retryable: false } };
  }
}

const lead = { id: "u-1", role: "lead", team: "platform" };
const agent = { id: "u-2", role: "agent", team: "platform" };
const otherTeam = { id: "u-3", role: "lead", team: "billing" };

const full = readTicket({ viewer: lead, args: { id: "TCK-101", includeInternal: true } });
assert.equal(full.ok, true);
assert.deepEqual(full.data.internalComments, ["Escalated to the platform on-call."]);

assert.equal(readTicket({ viewer: agent, args: { id: "TCK-101" } }).ok, true);
assert.equal(
  readTicket({ viewer: agent, args: { id: "TCK-101", includeInternal: true } }).error.code,
  "FORBIDDEN",
);
assert.equal(readTicket({ viewer: otherTeam, args: { id: "TCK-101" } }).error.code, "NOT_FOUND");
assert.equal(readTicket({ viewer: lead, args: { id: "TCK-999" } }).error.code, "NOT_FOUND");
assert.equal(readTicket({ viewer: lead, args: { id: "bad-id" } }).error.code, "INVALID_ARGUMENT");
assert.equal(
  readTicket({ viewer: lead, args: { id: "TCK-101", extra: true } }).error.code,
  "INVALID_ARGUMENT",
);

// A broken store can produce a shape that passes the input schema but fails the output contract.
const brokenStore = new Map([
  ["TCK-101", { id: "TCK-101", title: 42, status: "open", team: "platform", comments: [], internal: [] }],
]);
assert.equal(
  readTicket({ viewer: lead, args: { id: "TCK-101" }, store: brokenStore }).error.code,
  "INTERNAL",
);

console.log("tool-contracts: 9 assertions passed");
```

运行：

```bash
node read-ticket.mjs
# tool-contracts: 9 assertions passed
```

九条断言覆盖：负责人读取内部备注、普通成员读取公开字段、普通成员被拒绝、跨团队被当作不存在、资源不存在、ID 格式错误、未知字段、输出结构损坏。没有一条依赖网络或模型。

## 输入校验：拒绝而不是猜测

`validateInput` 做了三件事：

1. 只接受普通对象，数组和 `null` 直接拒绝。
2. 拒绝未知字段，避免调用方以为 `includeInternal` 拼错成 `include_internal` 仍然生效。
3. 检查 `id` 的正则和 `includeInternal` 的布尔类型。

未知字段是否拒绝，取决于契约严格程度。对面向模型的高风险工具，建议严格拒绝：模型可能凭印象多传字段，静默忽略会让它误以为参数生效。对兼容性要求高的内部工具，可以允许扩展字段，但要在描述中写清。

校验失败返回 `INVALID_ARGUMENT`，`retryable: false`。模型不应该原样重试；它应该修正参数，或向用户询问。把校验错误标成可重试，会诱发无意义的循环。

## 授权：与 schema 分开

示例里，`viewer` 是函数参数，由宿主在调用工具前注入，绝不从 `args` 读取。如果工具参数里有 `viewerId` 或 `role`，模型就可以伪造身份；即使 schema 把它标成 `enum`，也只是限制格式，不是权限。

授权判断有两处：

- 跨团队访问返回 `NOT_FOUND`，而不是 `FORBIDDEN`。这样不会泄露“这个工单存在，只是不属于你”。是否隐藏存在性取决于业务；关键是要显式决定，而不是顺带返回。
- 普通成员请求内部备注返回 `FORBIDDEN`。这是角色权限，不是输入格式问题，所以不能靠 schema 的 `if/then` 解决。

顺序也重要：先确认资源存在且属于当前租户，再判断字段级权限，最后才序列化输出。反过来先拼接完整对象再裁剪，很容易在中间步骤把内部字段带出去。

## 业务错误：让调用方知道该不该重试

示例固定了四种错误码：

| 码 | 含义 | 可重试 | 调用方动作 |
| --- | --- | --- | --- |
| `INVALID_ARGUMENT` | 参数不合法 | 否 | 修正参数或询问用户 |
| `NOT_FOUND` | 资源不存在或无权知道 | 否 | 停止，不要枚举 ID |
| `FORBIDDEN` | 身份合法但权限不足 | 否 | 升级权限或换人 |
| `INTERNAL` | 未预期失败 | 否（本例） | 记录 trace，人工排查 |

真实系统还可能需要 `CONFLICT`、`RATE_LIMITED`、`UNAVAILABLE` 等。重点不是码的数量，而是每个码的**语义稳定**：同一个码在不同工具里含义一致，调用方才能写通用处理。HTTP 状态码、数据库错误文本、堆栈都不应该直接暴露给模型；把它们映射成有限集合，细节写进服务端日志。

## 输出校验：别让模型替工具擦屁股

示例最后用一个 `title: 42` 的坏 store 触发输出校验，返回 `INTERNAL`。这一步经常被省略：输入合法、授权通过，但底层数据或序列化逻辑变了，模型收到 `title` 是数字，可能把它编成“标题缺失”，而不是报告工具故障。

输出校验应该检查：

- 必填字段存在且类型正确。
- 枚举值在允许集合内。
- 数组元素类型一致。
- 可选字段出现时也符合契约。

输出校验失败不要返回原始值让模型“自己判断”，那会把契约错误变成模型幻觉。返回通用 `INTERNAL`，在服务端记录工具名、trace id 和脱敏后的字段路径。

## 常见错误与诊断

- **从 `args` 读取 `viewerId`**：模型可以传任意值，等于没有授权；身份必须来自宿主上下文。
- **用 `FORBIDDEN` 暴露资源存在性**：跨租户枚举会得到“存在但无权”的信号；按业务选择 `NOT_FOUND`，并保持所有入口一致。
- **把 `FORBIDDEN` 标成可重试**：Agent 会重复调用同一个无权限工具；永久错误应 `retryable: false`。
- **未捕获异常直接冒泡**：调用方可能收到堆栈、SQL 或文件路径；在工具边界统一映射为 `INTERNAL`，细节只进脱敏日志。
- **只校验输入不校验输出**：上游数据漂移会让模型收到错误类型；输出断言能在工具边界提前失败。

## 验收标准

- 工具参数中不包含可伪造的身份或权限字段。
- 每个错误码有稳定语义，并明确 `retryable`。
- 成功、参数错误、未授权、跨租户、资源不存在、输出损坏至少各有断言。
- 示例可在无网络、无模型、无第三方依赖的环境运行通过。
- 失败响应不包含堆栈、SQL、内部路径或完整底层错误。

## 参考来源

- JSON Schema, *Getting Started Step by Step*：https://json-schema.org/learn/getting-started-step-by-step
- MCP 架构（工具调用与错误语义）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- OWASP Authorization Cheat Sheet：https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

官方资料核对日期：2026-11-14。示例在本地 Node v24.11.0 实际运行，未调用模型，也不声称覆盖所有授权模型。