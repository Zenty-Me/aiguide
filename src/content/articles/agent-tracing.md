---
title: "Agent 运行追踪：trace、run、step 与脱敏日志"
description: "用一个离线 Node 追踪器串起 trace/run/step、重试关联、耗时与结果，在写入前脱敏，并诚实划清玩具与生产追踪的边界。"
category: "agent"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 440
tags: ["AI Agent", "可观测性", "日志脱敏"]
featured: false
faq:
  - q: "trace 和 run 有什么区别？"
    a: "trace 对应一次用户请求或一个完整任务，run 对应一次尝试、每次重试新建，step 对应一个可观察动作；三层分开才能回答是第几次尝试、卡在哪一步。"
  - q: "重试时能复用原来的 runId 吗？"
    a: "不能。复用后两次尝试的耗时、结果和错误码会混在一条记录里，无法回答第一次为什么失败；应在同一 trace 下新建 run，并用 retryOf 指向被重试的运行。"
  - q: "只在打印日志时脱敏行不行？"
    a: "不行。内存和落盘仍是明文，日志一旦被采集或转发，脱敏就失效；应在写入缓冲区前替换敏感键、Bearer 值和邮箱，落盘后再断言一次。"
---

Agent 出错时，最没用的一句话是“它失败了”。你需要知道：这是哪次用户请求、第几次尝试、卡在哪个步骤、每步花了多久、错误码是什么，以及重试和原运行是不是同一条链路。本文用一个不依赖第三方库的 Node 追踪器，把 trace、run、step 三层 ID、耗时、结果和脱敏串起来，并明确说明它只是教学用的有界内存日志，不是生产级追踪系统。

## 前置条件

- Node.js 20 或更高版本；示例只使用 `node:assert`、`node:fs`、`node:os`、`node:path`，本地用 v24.11.0 运行。
- 理解工具调用的基本结构，建议先读 [Agent 工具契约](/articles/agent-tool-contracts/)；重试与幂等的关系见 [自动化幂等](/articles/automation-idempotency/)，评测方法见 [Agent 评测](/articles/agent-evaluation/)。
- 不需要模型 API、网络或追踪后端；运行的是本地自测。

## 三个 ID 各自回答什么

| ID | 范围 | 回答的问题 | 生命周期 |
| --- | --- | --- | --- |
| `traceId` | 一次用户请求或一个完整任务 | 这些动作属于同一件事吗？ | 从请求进入到最终响应 |
| `runId` | 一次尝试 | 这是第几次尝试，和上次什么关系？ | 每次重试新建 |
| `stepId` | 一个可观察动作 | 具体卡在读库、调工具还是解析？ | 动作开始到结束 |

一个常见错误是重试时复用 `runId`。复用后，两次尝试的耗时、结果和错误码混在同一条记录里，无法回答“第一次为什么失败、第二次为什么成功”。正确做法是：**同一个 `traceId` 下新建 `runId`，用 `retryOf` 指向被重试的运行**。新用户请求则新建 `traceId`，即使它调用同一个接口。

## 完整示例

```js
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SECRET_KEY = /^(authorization|cookie|set-cookie|.*(token|secret|password|api[-_]?key).*)$/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value
      .replace(BEARER, "Bearer [REDACTED]")
      .replace(EMAIL, "[EMAIL]")
      .slice(0, 300);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]),
    );
  }
  return value;
}

export function createTraceLogger({ maxEntries = 100, now = () => Date.now(), persistPath } = {}) {
  const entries = [];
  let dropped = 0;
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;

  function append(entry) {
    // Redaction happens before the entry is stored, not only before printing.
    entries.push(redact({ ...entry, at: new Date(now()).toISOString() }));
    while (entries.length > maxEntries) {
      entries.shift();
      dropped += 1;
    }
  }

  function startTrace(name) {
    const traceId = nextId("trace");
    append({ type: "trace_start", traceId, name });
    return {
      id: traceId,
      startRun({ attempt = 1, retryOf = null } = {}) {
        const runId = nextId("run");
        const started = now();
        append({ type: "run_start", traceId, runId, attempt, retryOf });
        return {
          id: runId,
          startStep(name, attributes = {}) {
            const stepId = nextId("step");
            const stepStarted = now();
            append({ type: "step_start", traceId, runId, stepId, name, attributes });
            return {
              end({ outcome = "ok", errorCode = null, attributes = {} } = {}) {
                append({
                  type: "step_end",
                  traceId,
                  runId,
                  stepId,
                  name,
                  outcome,
                  errorCode,
                  durationMs: now() - stepStarted,
                  attributes,
                });
              },
            };
          },
          end({ outcome = "ok", errorCode = null } = {}) {
            append({ type: "run_end", traceId, runId, outcome, errorCode, durationMs: now() - started });
          },
        };
      },
      end({ outcome = "ok" } = {}) {
        append({ type: "trace_end", traceId, outcome });
      },
    };
  }

  function dump() {
    return entries.map((entry) => structuredClone(entry));
  }

  function flush(filePath = persistPath) {
    if (!filePath) throw new Error("flush requires a file path");
    const body = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    writeFileSync(filePath, body, "utf8");
    return filePath;
  }

  return { startTrace, dump, flush, stats: () => ({ entries: entries.length, dropped }) };
}

// --- self-test: retry is a new run under the same trace ---
let tick = 0;
const logger = createTraceLogger({ maxEntries: 20, now: () => 1_000 + tick++ });
const trace = logger.startTrace("release-note-triage");
const firstRun = trace.startRun({ attempt: 1 });
const fetchStep = firstRun.startStep("fetch_issue", {
  url: "https://example.test/issues/42",
  headers: { Authorization: "Bearer abc.def.ghi" },
});
fetchStep.end({
  outcome: "error",
  errorCode: "ETIMEDOUT",
  attributes: { contact: "dev@example.com" },
});
firstRun.end({ outcome: "retry", errorCode: "ETIMEDOUT" });
const secondRun = trace.startRun({ attempt: 2, retryOf: firstRun.id });
const parseStep = secondRun.startStep("parse_issue");
parseStep.end({ outcome: "ok" });
secondRun.end({ outcome: "ok" });
trace.end({ outcome: "ok" });

const otherTrace = logger.startTrace("other-request");
otherTrace.end();
const entries = logger.dump();
const text = JSON.stringify(entries);
assert.equal(entries.some((entry) => entry.runId === secondRun.id && entry.retryOf === firstRun.id), true);
assert.notEqual(firstRun.id, secondRun.id);
assert.equal(entries.filter((entry) => entry.type === "trace_start").length, 2);
assert.equal(text.includes("abc.def.ghi"), false);
assert.equal(text.includes("dev@example.com"), false);
assert.equal(text.includes("[REDACTED]"), true);
assert.equal(text.includes("[EMAIL]"), true);
assert.equal(entries.find((entry) => entry.type === "step_end").durationMs > 0, true);

// maxEntries evicts oldest entries; it is a bound, not a durable store.
const bounded = createTraceLogger({ maxEntries: 3 });
const boundedTrace = bounded.startTrace("x");
boundedTrace.startRun();
boundedTrace.startRun();
boundedTrace.end();
assert.deepEqual(bounded.stats(), { entries: 3, dropped: 1 });

// Persisted output is redacted too; keep the temp file beside this example.
const file = fileURLToPath(new URL("./.trace-demo.jsonl", import.meta.url));
try {
  logger.flush(file);
  const persisted = readFileSync(file, "utf8");
  assert.equal(persisted.includes("abc.def.ghi"), false);
  assert.equal(persisted.includes("dev@example.com"), false);
} finally {
  rmSync(file, { force: true });
}

console.log("agent-tracing: 10 assertions passed");
```

运行：

```bash
node trace-logger.mjs
# agent-tracing: 10 assertions passed
```

## 一条记录长什么样

下面是该结构的一次输出示例（字段顺序与示例代码一致，时间值仅为示意）：

```json
{"type":"step_end","traceId":"trace-1","runId":"run-2","stepId":"step-3","name":"fetch_issue","outcome":"error","errorCode":"ETIMEDOUT","durationMs":4,"attributes":{"url":"https://example.test/issues/42"},"at":"2026-11-14T00:00:00.004Z"}
```

注意 `headers` 整个被 `[REDACTED]` 替换，`contact` 邮箱变成 `[EMAIL]`，`at` 是条目写入时间。`traceId` 相同、`runId` 不同，说明这是同一任务下的第二次尝试。

## 重试与新请求

判断规则可以写在代码里，也可以写在团队约定里，但必须一致：

- 同一任务因超时、限流、临时网络错误再次执行：**同 trace，新建 run**，`attempt` 递增，`retryOf` 指向上一次 `runId`。
- 用户重新发起一个请求，即使参数完全相同：**新建 trace**。否则两个独立请求会被误认为重试。
- 并行子任务：同 trace 下多个 run，用 `name` 或 `parentRunId` 区分；本文示例不展开并行。

`retryOf` 只指向直接上一次尝试还是最初一次，取决于查询需求。链式指向能还原每次重试；指向最初一次则查询“总共重试了几次”更方便。选一种并写进字段说明，不要一半一半。

## 耗时与结果

示例用可注入的 `now` 计算 `durationMs`，测试里每次调用递增，所以断言稳定。生产环境要注意：

- 耗时用单调时钟（如 `performance.now()`），不要用会被校时跳变的墙上时钟。
- `at` 用于展示和跨服务排序，用 UTC ISO 字符串；两者不要混用。
- `outcome` 只放有限枚举，如 `ok`、`error`、`retry`、`cancelled`；不要把整段错误消息塞进去。
- `errorCode` 放稳定码，堆栈和底层错误留在受控日志里，并单独脱敏。

如果 step 没有结束就抛异常，示例不会自动补一条 `step_end`。生产封装应该用 `try/finally` 保证收尾，或由外层超时器标记 `cancelled`；否则追踪里会出现永远“进行中”的步骤。

## 脱敏发生在写入前

示例的 `append` 先 `redact` 再 `push`，`flush` 写的是已经脱敏的条目。这个顺序很重要：如果只在打印时脱敏，内存和磁盘里仍然是明文密钥；一旦日志被采集、转发或误传，脱敏就失效了。

当前脱敏规则有三类：

1. 键名匹配 `authorization`、`cookie`、`token`、`secret`、`password`、`api_key` 等，整值替换。
2. 字符串里的 `Bearer ...` 和邮箱替换。
3. 字符串截断到 300 字符，避免把整段文档或模型输出写进日志。

它不是完备的。密钥可能藏在 `note`、`payload`、`headers` 的自定义键里，可能被 base64 编码，可能是用户粘贴的身份证号；正则也覆盖不了所有格式。生产系统应该：默认不记录完整请求/响应体；对已知敏感字段使用结构化白名单；在采集端再做一次策略；限制日志访问权限和保留期。不要把“加了脱敏函数”当成合规保证。

## 有界日志不是持久化

`maxEntries` 让内存中的条目数有上限，超出后丢弃最旧的，并累计 `dropped`。这能防止长跑进程把内存吃满，但也意味着：

- 进程退出，日志就没了；`flush` 只是把当前缓冲区写到文件，不是追加式持久化。
- 多进程各自维护自己的缓冲区，没有全局顺序。
- 丢弃的条目无法恢复，`dropped` 只能告诉你丢了多少。

生产追踪通常需要批量导出到后端、采样、重试、背压和保留策略；ID 也应与 OpenTelemetry 的 trace/span 或 W3C Trace Context 对齐，而不是自增字符串。本文示例只用于理解字段和顺序，不要直接当生产 SDK。

## 常见错误与诊断

- **重试复用 `runId`**：耗时和结果混在一起；每次尝试新建 run，并写 `retryOf`。
- **每次重试新建 trace**：无法把失败与成功串成一次任务；trace 应在任务入口创建，重试只新建 run。
- **只在展示层脱敏**：内存和落盘仍是明文；在 `append` 前脱敏，落盘前再断言一次。
- **日志无上限**：长会话或批量任务会耗尽内存；设置 `maxEntries`，并监控 `dropped`。
- **把异常对象直接序列化**：可能带堆栈、SQL、文件路径；只记录错误码和脱敏后的字段路径。
- **把教学追踪当生产方案**：没有导出、采样、持久化和访问控制；上线前替换为正式可观测性栈。

## 验收标准

- 同一任务的重试共享 `traceId`，每次尝试有独立 `runId` 和 `retryOf`。
- 每个 step 有开始/结束、耗时、结果和稳定错误码。
- 敏感键、Bearer 值、邮箱在写入内存和文件前已被替换。
- 缓冲区有明确上限，丢弃数量可观察。
- 文档明确写出该实现不持久、不跨进程、不具备生产追踪能力。

## 参考来源

- OpenTelemetry, *Traces*：https://opentelemetry.io/docs/concepts/signals/traces/
- W3C, *Trace Context*：https://www.w3.org/TR/trace-context/
- MCP 架构（日志与可观测性边界）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture

官方资料核对日期：2026-11-14。示例在本地 Node v24.11.0 实际运行；JSON 示例为结构示意，未作为独立命令执行。