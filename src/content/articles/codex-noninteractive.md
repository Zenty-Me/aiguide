---
title: "Codex 非交互模式：结果、事件流和退出码要分开看"
description: "用 codex exec 把 Codex 放进脚本：区分 stdout 最终消息与 stderr 进度，使用 -o、--json 和 --output-schema，并对结构化结果做独立校验。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 70
tags: ["Codex", "自动化", "CLI", "JSON", "CI"]
featured: false
---

## 目标：让脚本拿到可判断的结果

交互式会话里，人可以看着屏幕决定下一步；脚本不能。脚本需要三样东西：最终结果在哪里、过程信息会不会污染结果、失败时如何被发现。`codex exec` 分别用 stdout、stderr 和退出码回答这三个问题，`--json`、`-o`、`--output-schema` 则把结果整理成更适合程序消费的形式。

本文用 Bash 演示，所有命令都明确标出 shell；PowerShell 的路径和重定向写法不同，不要直接复制。示例中的 JSON 输出是示意，只有本地实际运行过的校验结果会特别标注。

## 前置条件

- 已安装并登录 Codex CLI；CI 中可用 `CODEX_API_KEY`，但不要把密钥放在作业级别或日志里。
- 一个干净的 Git 仓库，先提交基线，便于检查是否被写入。
- Node.js 20 以上，仅用于本文的 JSON 校验器；Codex 本身不依赖它。

## 第一步：先把两条输出流分开

在 Bash 中运行一个只读任务：

```bash
cd ~/code/scratch-repo
codex --ask-for-approval never exec --sandbox read-only \
  "阅读 README 和 package.json，用三句话说明项目用途和测试命令。" \
  > final.txt 2> progress.log
```

预期结果（示意）：`final.txt` 中是最后一段自然语言回答；`progress.log` 中是启动、读取文件、调用工具等进度信息。不同版本对进度格式可能不同，但**不要把两个流合并后再解析**。一旦合并，进度行就会混进最终结果，JSON 解析也会随机失败。

注意参数位置：`--ask-for-approval` 是全局选项，必须写在 `exec` 之前。写成 `codex exec ... --ask-for-approval never` 会以 `unexpected argument` 退出，把它移到 `exec` 前即可；`--sandbox` 在全局和 `exec` 两处都可用。

查看退出码：

```bash
status=$?
printf 'exit=%s\n' "$status"
```

交互式会话没有“最终消息”这个概念，脚本则必须有。默认模式下 `codex exec` 的 stdout 用于最终消息，stderr 用于进度和诊断；加 `--json` 后 stdout 改为事件流，最终消息要从事件中提取，`-o` 仍可单独保存它。这是后续所有管道的基础。

## 第二步：用 -o 保存最后一条消息

```bash
codex --ask-for-approval never exec --sandbox read-only \
  -o final.md \
  "列出仓库的顶层目录，并指出最可能需要先读的文件。"
```

`-o`（`--output-last-message`）把最后一条助手消息写入指定文件。它不改变沙箱，也不代表任务成功；文件存在只能说明进程走到了写文件这一步。仍要检查退出码和文件内容。不要把 `-o` 当成“结构化输出”，它只是把自然语言最后一条消息落盘。

## 第三步：用 --json 获取事件流

```bash
codex --ask-for-approval never exec --json --sandbox read-only \
  "检查当前仓库，给出一句摘要。" \
  > events.jsonl 2> progress.log
```

预期结果（示意）：`events.jsonl` 每行一个 JSON 对象，可能包含 `thread.started`、`turn.started`、`item.*`、`turn.completed` 等事件；具体字段随版本变化。`progress.log` 仍然是人类可读的进度，不应出现在 JSONL 里。

先用最小解析确认格式，而不是直接假设字段：

```bash
node -e 'const fs=require("fs"); for (const line of fs.readFileSync("events.jsonl","utf8").trim().split("\n")) { const e=JSON.parse(line); console.log(e.type ?? "unknown"); }'
```

如果某一行解析失败，先检查是否把 stderr 重定向进了同一个文件。不要用“跳过解析失败的行”来掩盖污染；那会让真正的错误事件也被忽略。

## 第四步：请求结构化结果，并独立校验

`--output-schema` 让 Codex 按给定 JSON Schema 生成最终回答。先写一个只包含必要字段的 schema：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "files": { "type": "array", "items": { "type": "string" } },
    "risk": { "enum": ["low", "medium", "high"] }
  },
  "required": ["summary", "files", "risk"],
  "additionalProperties": false
}
```

然后运行：

```bash
codex --ask-for-approval never exec --sandbox read-only \
  --output-schema schema.json -o result.json \
  "总结当前仓库：summary 用一句话，files 列出你实际读过的文件，risk 只能是 low、medium 或 high。"
```

预期结果：`result.json` 是一段 JSON。**不要因为用了 `--output-schema` 就跳过校验**；把它当作对模型的请求，而不是运行时保证。把下面代码保存为 `validate.mjs`，用一个小校验器检查必需字段、类型、枚举和额外字段：

```js
import { readFile } from "node:fs/promises";
const [schemaPath, dataPath] = process.argv.slice(2);
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const data = JSON.parse(await readFile(dataPath, "utf8"));
const errors = [];
const typeOf = (v) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
function check(value, rule, path) {
  if (rule.type && typeOf(value) !== rule.type) {
    errors.push(`${path}: expected ${rule.type}, got ${typeOf(value)}`); return;
  }
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: expected one of ${rule.enum.join(", ")}`);
  if (rule.type === "object") {
    for (const key of rule.required ?? []) if (!(key in value)) errors.push(`${path}: missing required ${key}`);
    for (const [key, child] of Object.entries(rule.properties ?? {})) {
      if (key in value) check(value[key], child, `${path}.${key}`);
    }
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in rule.properties)) errors.push(`${path}: unexpected ${key}`);
    }
  }
  if (rule.type === "array" && rule.items) {
    value.forEach((item, i) => check(item, rule.items, `${path}[${i}]`));
  }
}
check(data, schema, "$");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("valid");
```

本地离线校验的实际结果是：合法样本输出 `valid`、退出码 0；缺少 `files` 且 `risk` 非法的样本输出两行错误、退出码 1。这个校验器只覆盖本文用到的 schema 子集，不是完整 JSON Schema 实现；生产环境应使用经过验证的校验库。

## 第五步：把退出码和产物一起判断

在脚本里不要只检查文件是否存在：

```bash
codex --ask-for-approval never exec --sandbox read-only \
  --output-schema schema.json -o result.json "按 schema 总结仓库。"
status=$?
node validate.mjs schema.json result.json || exit 1
[ "$status" -eq 0 ] || exit "$status"
```

预期：只有进程退出码为 0，且 schema 校验通过，才算这次调用成功。官方文档没有承诺固定的非零错误码含义，所以不要根据 `1`、`2` 判断具体原因；记录 stderr 和事件流，按失败处理即可。

如果任务需要写文件，把沙箱改为 `workspace-write`，并重新考虑审批：无人值守时不应假装有人会点确认。`--full-auto` 已不再受支持，旧脚本中的这个参数会直接失败；应改用明确的 `--sandbox workspace-write` 等选项，而不是从旧博客复制命令。

## 常见失败与诊断

**1. 报 `--full-auto` 不受支持。** 这是旧参数。查看 `codex exec --help`，用 `--sandbox` 明确沙箱；不要为了兼容旧脚本而寻找隐藏开关。若报的是 `unexpected argument '--ask-for-approval'`，那是位置问题：把审批策略移到 `exec` 之前。

**2. JSONL 某行解析失败。** 检查重定向：`2>` 必须单独指向日志文件；不要把 `2>&1` 用在 `--json` 管道里。再检查是否有启动横幅被写进 stdout；以实际事件流为准。

**3. schema 校验失败但模型说“已完成”。** 以校验器输出为准，定位 `$.files`、`$.risk` 等路径。不要为了通过而删除 `required` 或打开 `additionalProperties`；先修提示词或 schema，让约束表达真实需求。

**4. 退出码为 0，但 `result.json` 为空或不存在。** 检查 `-o` 的路径是否可写、任务是否真的产生了最终消息。进程成功不等于结果有效；把“文件非空 + schema 通过”加入验收。

**5. CI 中认证失败。** 确认 `CODEX_API_KEY` 只注入到需要它的步骤，不在日志中打印；不要把密钥写进仓库或 `.env` 提交。认证失败和沙箱拒绝是两类问题，先看 stderr 的认证提示，再调权限。

## 验收清单

- [ ] stdout 与 stderr 分开保存，最终消息没有被进度污染。
- [ ] 能用 `-o` 找到最后一条消息，并知道它不是结构化保证。
- [ ] `--json` 的每一行都能被 JSON 解析。
- [ ] `--output-schema` 的结果经过独立校验器检查。
- [ ] 脚本同时检查退出码和产物，不依赖固定错误码含义。
- [ ] 没有使用已废弃的 `--full-auto`，也没有在无人值守写任务中假设有人审批。

## 接下来

如果还没有配置登录和计费方式，先看 [安装与登录](/articles/codex-install-login/)。要让脚本获得写权限，必须先理解 [沙箱与审批](/articles/codex-permissions/)；把这一步接进流水线时，可参考 [自动化流水线](/articles/automation-pipeline/) 的分段思路。

## 参考来源

- [Codex 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex CLI 参数参考](https://learn.chatgpt.com/docs/cli/reference)
- [JSON Schema 官方文档](https://json-schema.org/)

核验范围（2026-11-14）：`codex exec` 的输出流、`-o`、`--json`、`--output-schema` 和退出码语义依据官方页面核对；JSON 校验器的通过/失败结果来自本地离线运行。具体事件字段与参数以本机 `codex exec --help` 为准。