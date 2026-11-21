---
title: "自动化幂等：重复事件、状态机与有界重试"
description: "用离线 Node 示例实现幂等键、in_progress/succeeded/failed 状态、瞬时与永久错误、指数退避，并说明内存演示为何不是 exactly-once。"
category: "automation"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 540
tags: ["幂等性", "Webhook", "Node.js"]
featured: false
faq:
  - q: "幂等键为什么要避开随机 UUID？"
    a: "键必须稳定，同一业务事件的所有重试都要用同一个键。随机 UUID 或本次请求 ID 每次都不同，等于没有幂等，重复投递仍会重复执行。键通常由事件来源 ID 加动作组成。"
  - q: "为什么先执行再写状态会重复？"
    a: "两个并发请求会同时读到空记录，都去执行。正确顺序是先同步写入 in_progress 占位，再 await 业务处理，这样后到的请求看到占位就返回 IN_PROGRESS，让调用方稍后重试。"
  - q: "这套内存示例能直接上生产吗？"
    a: "它只做单进程内的重复抑制。状态在内存 Map 里，进程重启即丢，多进程各有一份记录，in_progress 也没有租约。生产要换成数据库唯一约束或事务性 outbox，并对下游使用提供方幂等键。"
---

Webhook 和任务队列通常只保证“至少一次”投递：同一个事件可能因为超时、重试、重复点击或网络抖动到达两次。如果处理逻辑是“收到就发通知/扣款/建工单”，重复事件就会产生重复副作用。本文用一个不依赖数据库和第三方库的 Node 示例，实现稳定的幂等键、三种状态、瞬时/永久错误分类和有界退避，并明确说明这个内存演示为什么不能承诺 exactly-once。

## 前置条件

- Node.js 20 或更高版本；示例只用 `node:assert`，本地用 v24.11.0 运行。
- 理解 Promise、`async/await` 和基本的错误处理。
- 知道“至少一次投递”和“恰好一次处理”不是同一件事；如果不确定，先读 [自动化流水线](/articles/automation-pipeline/)、[Agent 运行追踪](/articles/agent-tracing/) 和 [CI 密钥边界](/articles/automation-secrets/)。
- 不需要网络、模型 API 或数据库；所有状态在进程内。

## 幂等键：来自事件身份，不来自本次尝试

一个好的键要满足：

- **稳定**：同一业务事件的所有重试使用同一个键；不能用 `Date.now()`、随机 UUID 或“本次请求 ID”。
- **唯一**：不同业务事件不能碰撞；通常由事件来源的 ID 加上动作组成。
- **有界**：长度和字符集固定，便于数据库唯一索引和日志记录。
- **不可猜测**：如果键能被外部构造，攻击者可以抢占或重放；键不是授权凭证，仍需鉴权。

示例用 `evt:<event-id>:<action>`，例如 `evt:release-42:notify`。同一个 release 的“通知”动作重试时键不变；`release-43` 或“归档”动作则是另一个键。两个不同事件即使 payload 相同，也不能共用一个键，否则第二个事件会被当成重复而丢掉。

## 三种状态

| 状态 | 含义 | 重复请求的处理 |
| --- | --- | --- |
| `in_progress` | 已有请求占位，正在执行 | 返回 `IN_PROGRESS`，让调用方稍后重试 |
| `succeeded` | 已成功，结果已保存 | 直接返回保存的结果，`replayed: true` |
| `failed` | 已失败 | 永久失败直接返回；可重试失败允许再次尝试 |

关键顺序是：**先占位，再 await 业务处理**。如果先执行、后写状态，两个并发请求会同时看到“没有记录”，都去执行。示例在进入 `for` 循环后同步写入 `in_progress`，然后才 `await handler(payload)`，所以同一进程内的第二个调用会看到占位。

`in_progress` 也有代价：进程崩溃后记录可能永远停在执行中。生产实现需要租约/超时，把过期的 `in_progress` 转为可重试，或由人工清理；示例没有实现这一点。

## 完整示例

```js
import assert from "node:assert/strict";

class PermanentError extends Error {}
class TransientError extends Error {}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

class InMemoryStore {
  constructor() {
    this.records = new Map();
  }
  get(key) {
    return this.records.get(key);
  }
  set(key, record) {
    this.records.set(key, record);
  }
}

function validateKey(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9:_-]{8,128}$/.test(key)) {
    throw new PermanentError("idempotency key must be 8-128 letters, digits, ':', '_' or '-'");
  }
}

function errorResult(code, message, retryable) {
  return { ok: false, error: { code, message, retryable } };
}

export async function runIdempotent({
  key,
  payload,
  store,
  handler,
  maxAttempts = 3,
  baseDelayMs = 10,
  maxDelayMs = 40,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  try {
    validateKey(key);
  } catch (error) {
    return errorResult("INVALID_KEY", error.message, false);
  }

  const fingerprint = canonical(payload);
  let record = store.get(key);

  if (record && record.fingerprint !== fingerprint) {
    return errorResult("IDEMPOTENCY_KEY_REUSED", "key was already used with a different payload", false);
  }
  if (record?.status === "succeeded") {
    return { ok: true, value: record.value, replayed: true, attempts: record.attempts };
  }
  if (record?.status === "in_progress") {
    return errorResult("IN_PROGRESS", "the original request is still running; retry with the same key", true);
  }
  if (record?.status === "failed" && record.retryable === false) {
    return { ...errorResult(record.error.code, record.error.message, false), replayed: true };
  }

  let attempts = record?.attempts ?? 0;
  if (attempts >= maxAttempts) {
    return errorResult("RETRY_EXHAUSTED", "no attempts left for this key", false);
  }

  for (let attempt = attempts + 1; attempt <= maxAttempts; attempt += 1) {
    // Reserve before awaiting work. A duplicate that arrives now sees in_progress.
    store.set(key, {
      key,
      fingerprint,
      status: "in_progress",
      attempts: attempt,
      retryable: false,
    });

    try {
      const value = await handler(payload);
      store.set(key, { key, fingerprint, status: "succeeded", attempts: attempt, value, retryable: false });
      return { ok: true, value, replayed: false, attempts: attempt };
    } catch (error) {
      const message = String(error?.message ?? error);
      const transient = error instanceof TransientError || error?.transient === true;
      if (!transient) {
        const failure = { code: "PERMANENT_FAILURE", message, retryable: false };
        store.set(key, { key, fingerprint, status: "failed", attempts: attempt, error: failure, retryable: false });
        return { ok: false, error: failure, attempts: attempt };
      }
      if (attempt === maxAttempts) {
        const failure = { code: "RETRY_EXHAUSTED", message, retryable: false };
        store.set(key, { key, fingerprint, status: "failed", attempts: attempt, error: failure, retryable: false });
        return { ok: false, error: failure, attempts: attempt };
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delay);
    }
  }

  return errorResult("RETRY_EXHAUSTED", "unreachable retry state", false);
}

async function main() {
  const delays = [];
  const sleep = async (ms) => delays.push(ms);
  const store = new InMemoryStore();
  let calls = 0;

  const first = await runIdempotent({
    key: "evt:release-42:notify",
    payload: { issue: 42, channel: "release" },
    store,
    sleep,
    handler: async () => {
      calls += 1;
      if (calls === 1) throw new TransientError("socket reset");
      return { delivered: true };
    },
  });
  assert.deepEqual(first, { ok: true, value: { delivered: true }, replayed: false, attempts: 2 });
  assert.deepEqual(delays, [10]);

  // A duplicate event reads the stored result and does not execute again.
  const duplicate = await runIdempotent({
    key: "evt:release-42:notify",
    payload: { channel: "release", issue: 42 },
    store,
    handler: async () => {
      calls += 1;
      return { delivered: "wrong" };
    },
  });
  assert.equal(duplicate.replayed, true);
  assert.equal(calls, 2);

  const reused = await runIdempotent({
    key: "evt:release-42:notify",
    payload: { issue: 43 },
    store,
    handler: async () => ({ delivered: true }),
  });
  assert.equal(reused.error.code, "IDEMPOTENCY_KEY_REUSED");

  const invalid = await runIdempotent({
    key: "short",
    payload: {},
    store: new InMemoryStore(),
    handler: async () => ({}),
  });
  assert.equal(invalid.error.code, "INVALID_KEY");

  const permanentStore = new InMemoryStore();
  let permanentCalls = 0;
  const permanent = await runIdempotent({
    key: "evt:release-43:notify",
    payload: {},
    store: permanentStore,
    handler: async () => {
      permanentCalls += 1;
      throw new PermanentError("channel does not exist");
    },
  });
  assert.equal(permanent.error.code, "PERMANENT_FAILURE");
  assert.equal(permanentCalls, 1);

  const exhaustedDelays = [];
  let exhaustedCalls = 0;
  const exhausted = await runIdempotent({
    key: "evt:release-44:notify",
    payload: {},
    store: new InMemoryStore(),
    maxAttempts: 3,
    sleep: async (ms) => exhaustedDelays.push(ms),
    handler: async () => {
      exhaustedCalls += 1;
      throw new TransientError("upstream unavailable");
    },
  });
  assert.equal(exhausted.error.code, "RETRY_EXHAUSTED");
  assert.equal(exhaustedCalls, 3);
  assert.deepEqual(exhaustedDelays, [10, 20]);

  // Two concurrent calls: one reserves the key, the other sees in_progress.
  const concurrentStore = new InMemoryStore();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let concurrentCalls = 0;
  const call = () =>
    runIdempotent({
      key: "evt:release-45:notify",
      payload: {},
      store: concurrentStore,
      handler: async () => {
        concurrentCalls += 1;
        await gate;
        return { delivered: true };
      },
    });
  const pendingFirst = call();
  const pendingSecond = call();
  release();
  const [concurrentFirst, concurrentSecond] = await Promise.all([pendingFirst, pendingSecond]);
  assert.equal(concurrentFirst.ok, true);
  assert.equal(concurrentSecond.error.code, "IN_PROGRESS");
  assert.equal(concurrentCalls, 1);

  // Different event IDs with the same payload are separate operations.
  const separateStore = new InMemoryStore();
  let separateCalls = 0;
  await runIdempotent({
    key: "evt:release-46:a",
    payload: { issue: 42 },
    store: separateStore,
    handler: async () => {
      separateCalls += 1;
      return "a";
    },
  });
  await runIdempotent({
    key: "evt:release-46:b",
    payload: { issue: 42 },
    store: separateStore,
    handler: async () => {
      separateCalls += 1;
      return "b";
    },
  });
  assert.equal(separateCalls, 2);

  console.log("automation-idempotency: 12 assertions passed");
}

await main();
```

运行：

```bash
node idempotency.mjs
# automation-idempotency: 12 assertions passed
```

## 示例覆盖了什么

- 第一次 handler 抛瞬时错误，退避 10ms 后第二次成功，返回 `attempts: 2`。
- 重复事件 payload 键顺序不同，规范化后指纹一致，直接返回保存结果，handler 不再执行。
- 同一个键换 payload，返回 `IDEMPOTENCY_KEY_REUSED`。
- 非法键返回 `INVALID_KEY`。
- 永久错误只执行一次，返回 `PERMANENT_FAILURE`。
- 连续瞬时错误在 3 次后返回 `RETRY_EXHAUSTED`，退避为 10、20，没有无限重试。
- 并发两个调用，只有一个执行，另一个看到 `IN_PROGRESS`。
- 不同事件 ID、相同 payload 是两个操作，各自执行。

## 瞬时错误与永久错误

分类错了，重试就会帮倒忙：

| 错误 | 分类 | 处理 |
| --- | --- | --- |
| 连接重置、超时、429、502/503/504 | 瞬时 | 有界退避后重试 |
| 参数校验失败、401/403、404、业务规则冲突 | 永久 | 立即失败，不重试 |
| 未知异常 | 保守 | 默认永久，记录 trace 后人工判断 |

示例用 `TransientError` 或 `error.transient === true` 标记瞬时错误，其余都当永久。生产代码不要靠错误消息文本判断；应由调用层把 HTTP 状态码或驱动错误映射成明确类型。

退避也要有界：`baseDelayMs * 2 ** (attempt - 1)` 再取 `maxDelayMs` 上限，避免第 20 次重试等几天。生产还应加抖动（jitter）、总耗时上限，并尊重服务端的 `Retry-After`。示例为了断言稳定，没有加随机抖动。

## 为什么这不是 exactly-once

这个示例的 `InMemoryStore` 是一个 `Map`：

- 进程退出后状态全丢，重启后同一事件会再次执行。
- 两个进程/两台机器各有自己的 `Map`，同一个键在两个进程里都能通过检查。
- 即使在同一进程，handler 成功但进程在 `store.set(succeeded)` 之前崩溃，重试仍可能再次执行。
- `in_progress` 没有租约，崩溃后可能永久卡住。

所以它提供的是**单进程内的重复抑制**，不是分布式 exactly-once。要接近“效果一次”，需要：

1. 用数据库唯一索引或事务，把“占位”和业务写入放在同一个原子操作里；或者使用事务性 outbox。
2. 对子调用使用提供方支持的幂等键（支付、邮件、工单 API 通常有）。
3. handler 本身设计成可重复执行，或用唯一约束兜底。
4. 设置键的保留期和清理策略；永久保存会无限增长。
5. 接受“至少一次”投递，不要向外承诺 exactly-once。

即使全部做到，跨系统的 exactly-once 仍然很难；更准确的说法是“幂等处理使重复投递不产生重复副作用”。

## 常见错误与诊断

- **每次重试生成新键**：等于没有幂等；键必须由事件 ID 和动作决定，不能由本次尝试生成。
- **用 payload 哈希当唯一键**：同一事件字段顺序变化或补充了元数据就会变成新键；哈希可用于指纹校验，不替代稳定事件 ID。
- **先执行后占位**：并发请求都看到空记录，重复执行；先同步占位，再 await。
- **所有错误都重试**：参数错误、权限错误会永远失败；区分瞬时/永久，并设置最大次数。
- **把内存 Map 当持久去重**：多进程/重启失效；换数据库唯一约束或持久存储。
- **承诺 exactly-once**：投递、处理和副作用跨系统，无法靠一个 Map 保证；改为幂等 + 可重放。

## 验收标准

- 同一事件的重试使用同一个键，不同事件不共用键。
- 成功结果可重放，重复请求不再执行 handler。
- `in_progress`、`succeeded`、永久失败、重试耗尽都有测试。
- 退避有上限，最大尝试次数可配置。
- 文档明确说明内存存储不跨进程、不持久，不承诺 exactly-once。
- 生产方案说明数据库唯一约束、租约/清理和下游幂等键。

## 参考来源

- AWS Builders Library, *Making retries safe with idempotent APIs*：https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Stripe Docs, *Idempotent requests*：https://docs.stripe.com/api/idempotent_requests
- GitHub Docs, *Best practices for using webhooks*：https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks

官方资料核对日期：2026-11-14。示例在本地 Node v24.11.0 实际运行；内存存储和固定退避仅用于演示，未连接真实队列或数据库。