---
title: "Agent 工具循环：重复调用、超时与失败预算怎么停"
description: "Agent 的本质是“调工具—读结果—再决策”的循环。真正决定它能不能上线的不是模型多聪明，而是重复调用、无进展、超时和成本这四类失败有没有被硬性限制。"
category: agent
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 430
tags: ["Agent", "工具调用", "失败预算", "可靠性"]
featured: true
---

## 目标：让循环一定停得下来

编码 Agent 跑起来的样子很像“智能”：读文件、跑命令、看到报错、换个思路再试。但拆开看，它只是一个循环：

```text
决定下一步 → 调用工具 → 读到结果 → 更新状态 → 再决定
```

循环能持续多久、什么时候该放弃，**不应该由模型自己判断**。模型没有“我已经绕了 40 圈”的自觉，它每一步都觉得自己在进步。工程上的做法是：把停止条件和失败预算写成宿主代码里的硬约束。

本文目标：给一个 agent 循环加上四类预算，并能用注入故障的方式验证它确实会停。

## 前置条件

- 有一个能调用工具的 agent 循环（自研或基于 SDK 都可以）
- 工具调用有结构化返回：成功/失败、错误类型、耗时
- 能构造测试用的假工具（返回固定错误、固定空结果、固定超时）

## 循环里的五个状态，缺一个就会失控

一个可控的循环至少显式维护这五样东西：

1. **步数**（step）：本轮任务已经发生的工具调用轮次；
2. **已用时间**（wall clock）：从开始到现在的真实耗时；
3. **累计成本**（tokens / 调用次数）：不只是钱，也是延迟；
4. **进展指纹**（progress fingerprint）：这一步是否产生了新的可用信息；
5. **重复检测**（repeat set）：相同工具 + 相同参数出现了几次。

前三个是资源上限，后两个是**语义上限**——很多失控循环资源消耗并不高，只是原地打转。

## 四类失败预算

| 预算 | 触发条件（示例） | 触发后的动作 |
| --- | --- | --- |
| 步数上限 | 超过 25 步 | 停止，输出中间结论与未完成原因 |
| 时间上限 | 超过 8 分钟 | 停止，保留现场供人接手 |
| 重复调用 | 同一 `工具+参数` 第 3 次出现 | 注入提示"该调用已失败 2 次，换策略或停止"；第 4 次强制停 |
| 无进展 | 连续 4 步没有新增文件、没有新错误信息、没有新测试结果 | 停止并说明卡在哪 |

参数要按任务类型调：改一个函数 25 步足够，跨模块重构可能需要 60 步。**先定基线再调**，不要在事故后凭感觉改数字。

## 参考实现

下面是一段演示结构的最小 TypeScript，重点在两个位置：**预算怎么传给正在执行的那一次调用**，以及**什么时候才算完成**。

```ts
type ToolResult = {
  ok: boolean;          // 这一次工具调用是否成功
  summary: string;      // 回送给下一轮的结果摘要
  fingerprint: string;  // 由工具产生的进展指纹（不带 = 无进展）
};

const BUDGET = {
  maxSteps: 25,
  maxMs: 8 * 60_000,
  maxRepeats: 3,
  maxNoProgress: 4,
};

type Action = { name: string; args: unknown };

// 归一化参数：同一调用换个引号写法不该算新调用
function normalize(args: unknown): string {
  return JSON.stringify(args ?? null);   // 演示用；真实实现还要处理键序、路径写法、相对/绝对路径
}

type Phase = "decide" | "tool" | "complete";

class DeadlineError extends Error {
  constructor(readonly phase: Phase) {
    super(`deadline exceeded during ${phase}`);
  }
}

// 关键：一个绝对 deadline 覆盖三个异步阶段，每次都只拿「剩余时间」，绝不重置预算
async function withDeadline<T>(
  phase: Phase,
  work: (signal: AbortSignal) => Promise<T>,
  deadlineAt: number,
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new DeadlineError(phase);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new DeadlineError(phase)),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runAgent(
  task: string,
  decideNextAction: (task: string, history: string[], signal: AbortSignal) => Promise<Action>,
  callTool: (name: string, args: unknown, signal: AbortSignal) => Promise<ToolResult>,
  taskComplete: (history: string[], signal: AbortSignal) => Promise<boolean>,
) {
  const deadlineAt = Date.now() + BUDGET.maxMs;   // 只在这里定一次，三个相位共用
  const seen = new Map<string, number>();
  const history: string[] = [];   // 每一步结果都要进入下一轮上下文
  let noProgress = 0;
  let lastFingerprint = "";

  for (let step = 1; step <= BUDGET.maxSteps; step++) {
    let action: Action;
    try {
      // 模型决策本身也会挂住（网关不返回、流式响应卡住），同样受这个 deadline 约束
      action = await withDeadline("decide", (s) => decideNextAction(task, history, s), deadlineAt);
    } catch (err) {
      if (err instanceof DeadlineError) return stop("time_budget", step, err.phase);
      throw err;
    }

    const key = `${action.name}:${normalize(action.args)}`;
    const repeats = (seen.get(key) ?? 0) + 1;
    seen.set(key, repeats);
    if (repeats >= BUDGET.maxRepeats) return stop("repeat_call", step, key);

    let result: ToolResult;
    try {
      result = await withDeadline("tool", (s) => callTool(action.name, action.args, s), deadlineAt);
    } catch (err) {
      if (err instanceof DeadlineError) return stop("time_budget", step, err.phase);
      throw err;
    }

    history.push(result.summary);

    noProgress = result.fingerprint && result.fingerprint !== lastFingerprint
      ? 0
      : noProgress + 1;
    lastFingerprint = result.fingerprint || lastFingerprint;
    if (noProgress >= BUDGET.maxNoProgress) return stop("no_progress", step);

    // 工具调用成功 ≠ 任务完成；完成判据（等测试、等 CI）也会挂住，同样受 deadline 约束
    let done = false;
    try {
      done = result.ok && (await withDeadline("complete", (s) => taskComplete(history, s), deadlineAt));
    } catch (err) {
      if (err instanceof DeadlineError) return stop("time_budget", step, err.phase);
      throw err;
    }
    if (done) return { status: "done", step, result };
  }
  return stop("step_budget", BUDGET.maxSteps);
}

function stop(reason: string, step: number, detail?: string) {
  return { status: "stopped", reason, step, detail };
}
```

五个实现要点，每一条都对应一个真实会翻车的位置：

- **预算要在 await 里面生效，而且只定一次**。只在循环顶部判 `Date.now()`，遇到一个永不 resolve 的调用就再也不回来了；而如果每个阶段各自 `Date.now() + 超时`，预算会被反复重置——三次 100ms 的超时叠加成一个 300ms 的循环。上面的写法只有一个 `deadlineAt`，`withDeadline` 每次都算「还剩多少」，所以决策阶段花掉的时间会从工具阶段里扣掉。
- **决策、工具、完成检查三个 await 都要包**。只包工具调用的话，`decideNextAction`（网关不返回、流式卡住）和 `taskComplete`（等测试跑完、等 CI）照样能把循环挂死。实测把三者分别换成永不 resolve 的 Promise、预算 10ms，三次分别在 12ms（tool）、15ms（complete）、20ms（decide）以 `stopped / time_budget / 对应相位` 结束（Node 定时器本身有 1–10ms 抖动，所以不是恰好 10ms）。
- **deadline 只定一次，不能每个阶段重新算**。同一段代码里把预算改成 80ms、让决策阶段先花 60ms，再让工具挂住：整个循环 93ms 就收尾了，因为工具阶段只拿到剩下的 20ms；如果每个阶段各自 `now + 80ms`，这里会拖到 140ms 以上。
- **`AbortSignal` 只是“商量”，不是“杀死”**。工具忽略 signal 时，`Promise.race` 只能让外层先返回，底层任务仍在跑（实测 `stillRunning = true`）。所以“有限时间终止等待”不等于“释放资源”：对可能挂死、又不受控的调用（外部 CLI、不写 signal 的 SDK），还得放进子进程或 worker，到点 `child.kill("SIGKILL")`（实测返回 `signal=SIGKILL`）。进程内谁也杀不了同进程的同步挂死代码。
- **`result.ok` 不能当完成信号**。一个“已创建 README.md”的成功结果照样是 `ok: true`，拿它收工会把第 1 步误判为完成；正确的做法是把结果压进 `history` 回送下一轮，由独立的完成判据（测试通过、目标文件内容匹配）决定收工。
- **重复检测要归一化参数**。同一命令换个引号写法不该算新调用，否则检测形同虚设。
- **停止时返回结构化原因**，让上层能区分“任务完成”“预算耗尽”“被安全策略拦截”。这三种情况的重试策略完全不同。

## 错误分类比错误重试更重要

同一个循环里，不是所有失败都值得重试：

- **瞬时错误**（网络抖动、限流）：退避重试 1～2 次，之后当永久失败；
- **参数错误**（schema 不匹配、文件不存在）：重试无意义，应把错误原文回灌给模型换策略；
- **权限/策略错误**（被 hook 拦截、沙箱拒绝）：立即停止上报，绝不绕过；
- **逻辑错误**（测试失败）：这是正常反馈，计入步数但不计为工具失败。

把“测试失败”当工具失败去重试，是最常见的预算浪费。

## 上下文也会失控

循环越长，工具返回堆积越多。两个必须做的动作：

1. **截断**：单次工具输出超过阈值（比如 8 KB）时保留头部 + 尾部 + 关键行，中间省略；
2. **折叠**：把已完成的子步骤压成一句结论（“登录接口已改造，测试通过”），原始输出落盘。

不处理这两点，30 步之后模型会开始“忘记”最初的约束，而你可能误判为模型能力问题。

## 验收标准

1. 注入一个永远失败的假工具，循环在 `maxNoProgress` 步内停止并给出 `no_progress`；
2. 注入一个每次都成功的假工具，但让它 3 次返回相同内容，触发 `repeat_call`；
3. 把时间上限调到 2 秒，循环按时停止而不是等模型自己收尾；
4. 停止结果里有结构化原因、步数和可复现的中间产物路径；
5. 单次工具输出超限时上下文确有截断，不是“理论上会截断”。

## 常见错误

- **只设步数上限。** 20 步重复同一个失败命令同样是事故。
- **让模型自己决定何时停止。** 它会倾向继续尝试，尤其在提示词鼓励“不要放弃”时。
- **无进展判断用模型自述。** 自述不可验证，必须用外部信号（文件变化、测试结果、错误码）。
- **被拦截后自动重试。** 权限拦截是设计意图，不是故障。
- **预算只写在提示词里。** 提示词是建议，代码里的是约束。

循环可控之后，下一个问题是“它到底变好还是变差了”——见 [/articles/agent-evaluation/](/articles/agent-evaluation/)。工具来源本身可信吗？见 [/articles/mcp-boundaries/](/articles/mcp-boundaries/)。

## 参考来源

- Anthropic《Building effective agents》：agents 与 workflows 的区别、工具使用循环与环境反馈 <https://www.anthropic.com/research/building-effective-agents>
- Anthropic《Demystifying evals for AI agents》：多轮交互下的评估与失败定位 <https://www.anthropic.com/research/demystifying-evals-for-ai-agents>
- 本文代码为说明性实现，用于展示预算判断位置，不依赖特定 SDK
