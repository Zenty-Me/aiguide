---
title: "MCP 工具设计：把 count_words 的契约写窄"
description: "以现有 count_words 为例，设计窄名称、输入输出 schema、校验与授权边界，并把业务失败变成稳定的结构化结果。"
category: "mcp"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 240
tags: ["MCP", "工具设计", "Schema"]
featured: false
faq:
  - q: "MCP 工具名称应该怎么起？"
    a: "名称用动词加对象并保持稳定，只做计数的工具就叫计数词数，不要叫万能文本工具；只有真正不兼容的迁移才加版本号，描述要写清做什么、输入输出和什么时候不该用。"
  - q: "模型总是多传一个字段怎么办？"
    a: "说明描述里暗示了多语言之类的能力，或 schema 曾经静默接受过。收紧描述，拒绝额外字段并返回可读错误，不要用默认值把问题盖住。"
  - q: "参数 schema 能当权限校验用吗？"
    a: "两者是两条线。schema 只回答形状对不对，能否调用由 host 策略决定，能否看某条数据要在 handler 里单独判断，别把 role 放进参数交给模型。"
---

工具设计的目标不是“让模型什么都能做”，而是让它在正确的场景选到这个工具，并且很难传出坏参数。一个宽泛的 `process_text` 可能被用来翻译、总结、改代码；一个窄的 `count_words` 只做一件事，模型、host 和测试都更容易判断它是否成功。本文沿用站点现有 `count_words` 示例的名称、输入字段和输出字段，不引入未经验证的 SDK 方法。

## 前置条件

你已经有一个能启动的 MCP server，至少完成过 `tools/list` 和一次 `tools/call`。如果还没有，先看 [从零启动第一个 MCP server](/articles/mcp-first-server/)；对 host/client/server 和三类原语不熟，可先读 [MCP 架构](/articles/mcp-concepts/)。本文只讨论工具契约，不重复进程配置。

## 名称与描述：先缩小选择范围

名称用动词加对象，保持稳定：`count_words` 比 `text_tool` 好，`count_words_v2` 这种带版本的名称留给真正不兼容的迁移。描述要回答四个问题：做什么、输入是什么、输出是什么、什么时候不要用。

```text
Count words, characters, and lines in a short plain-text string.
Use for text up to 20,000 characters. Do not use for files, URLs, or HTML;
read those with the appropriate resource first.
```

这段描述没有承诺“智能分析”，也没有隐藏限制。模型看到 20,000 字符上限，就更可能在超长输入前先询问或分段；host 也能据此做前置检查。描述不是营销文案，宁可具体而笨。

## 输入 schema：只接受一种形状

现有示例的输入只有一个 `text` 字段，上限 20,000 字符。用 Zod 表达时，核心是对象、必填、类型、范围和拒绝额外字段：

```ts
import { z } from "zod";

export const countWordsInput = z
  .object({
    text: z.string().min(1).max(20_000),
  })
  .strict();

export type CountWordsInput = z.infer<typeof countWordsInput>;
```

`.strict()` 很重要：模型偶尔会多传 `language`、`encoding` 或 `options`。静默忽略会让模型以为参数生效，下一次继续传；直接拒绝并返回可读错误，才能让调用方修正。输入 schema 负责“形状对不对”，不负责“这个人能不能看”。后者是授权。

`.min(1)` 和 `.strict()` 是对上一篇文章里那个 `wordcount` 示例契约的**有意收紧**：原实现只限制 `text` 为字符串和 20,000 字符上限，空字符串与多余字段都能通过。修改 schema 就是修改对外契约，要明确告知调用方；跑在旧实现上的测试不能用来证明这些新语义，需要针对新 schema 补测试（空串、超长、额外字段各一条）。

对应的 JSON Schema 语义可以用三个词概括：`type: "object"`、`required: ["text"]`、`additionalProperties: false`。无论 SDK 如何把 Zod 转成 JSON Schema，这三个约束都应该存在。Schema 是给调用方和校验器看的，不是权限系统；把 `role`、`tenantId` 放进工具参数，再在 handler 里相信它，等于让模型自己给自己授权。

## 输出契约：机器可读，字段固定

`count_words` 的输出保持三个数字，不返回“共有 3 个单词”这种只适合人读的句子：

```ts
export function countWords(input: CountWordsInput) {
  const text = input.text;
  const normalized = text.trim();
  return {
    words: normalized === "" ? 0 : normalized.split(/\s+/).filter(Boolean).length,
    characters: [...text].length,
    lines: text.split("\n").length,
  };
}
```

字段含义要在描述或文档里写死：`words` 是按空白切分的词数，`characters` 按 Unicode 码点计数，`lines` 按换行符计数。现有示例返回的是 JSON 字符串形式的 text content；本文不额外声明 `outputSchema`，避免引入未验证的协议行为。无论采用哪种承载方式，输出形状必须稳定；如果以后要增加字段，先确认 host 的解析器能容忍新增字段，再发版本。

## 校验与授权：两条不同的线

| 问题 | 由谁回答 | 失败表现 |
| --- | --- | --- |
| `text` 是不是字符串、是否超长 | 输入 schema | 参数错误，handler 不执行 |
| 这个调用者能否使用该 server | host / 连接策略 | 拒绝连接或拒绝调用 |
| 这个用户能否看某条业务数据 | 工具内的授权逻辑 | `FORBIDDEN` 或隐藏存在性的 `NOT_FOUND` |

`count_words` 不读用户数据，授权主要发生在 host 是否允许这次调用；但不要因此把“schema 通过”当成“授权通过”。假设工具改成 `read_ticket`，参数只应有 `id`，调用者身份由 host 注入：

```json
{"name":"read_ticket","arguments":{"id":"TCK-101"}}
```

而不是：

```json
{"name":"read_ticket","arguments":{"id":"TCK-101","role":"admin"}}
```

第二种写法把权限交给了模型。更完整的可运行契约见 [Agent 工具契约：校验、授权与结构化失败](/articles/agent-tool-contracts/)。

## 业务失败：不要只抛一句错误

`count_words` 是纯函数，合法输入下基本只有成功；真实工具会遇到找不到、无权限、上游超时。此时返回结构化错误，而不是把堆栈拼进自然语言：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"code\":\"UPSTREAM_TIMEOUT\",\"message\":\"ticket service timed out\",\"retryable\":true}"
    }
  ],
  "isError": true
}
```

`code` 供程序分支，`message` 供人读，`retryable` 表示“换个时间重试是否有意义”。参数错误、权限错误通常不可重试；网络超时、限流可以。不要把所有失败都标成可重试，否则调用方会放大故障。也不要把内部路径、SQL 或 token 放进 `message`；这些信息进日志，不进模型上下文。

## 预期输出

对 `{"text":"hello mcp world"}`，示意结果为：

```json
{"words":3,"characters":15,"lines":1}
```

对 `{"text":123}`，现有 SDK 的校验路径通常会返回 `Input validation error`，并标记 `isError: true`；这是示意，具体文案随 SDK 版本变化。关键不是文案，而是 handler 没有被调用、错误可定位、调用方能修正参数。

## 验收标准

- 名称和描述能让另一个开发者在不看实现的情况下判断适用场景。
- 输入 schema 拒绝错误类型、空字符串、超长文本和额外字段。
- 输出字段固定，测试覆盖空串、纯空白、中文、多行文本。
- 授权信息不来自模型参数；越权路径有单独测试。
- 业务错误有稳定 code，且可重试与不可重试分开。

## 常见错误与诊断

- **模型总传 `language` 字段**：说明描述里暗示了多语言能力，或 schema 曾经静默接受过；收紧描述并拒绝额外字段，不要用默认值掩盖。
- **`text` 超长时返回 500**：schema 上限没有生效或 handler 自己又解析了一遍；把长度检查放在 schema，handler 只处理已校验输入。
- **工具返回一句“3 words”**：host 无法稳定解析，测试也无法断言；输出固定 JSON 字段。
- **把 `includeInternal` 放进 schema 就以为安全**：schema 只证明它是布尔值，不证明调用者有权看内部备注；授权必须在 handler 或 host 策略里单独完成。

## 参考来源

- MCP Architecture（2026-07-28 版，工具字段与调用）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- JSON Schema Getting Started：https://json-schema.org/learn/getting-started-step-by-step

官方资料核对日期：2026-11-14。代码为契约示例，未在本页连接真实 MCP server 执行；输出数值为按代码逻辑计算的示意。