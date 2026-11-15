---
title: "让 Codex 修一个失败的测试：先复现，再限定改动"
description: "用一个 Node 内置测试的小例子，把失败测试当作验收合同：先独立复现，再让 Codex 只改实现，最后用回归结果和 diff 审查确认没有偷改测试。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 50
tags: ["Codex", "测试", "调试", "Node.js", "代码审查"]
featured: false
---

## 目标：把“修好了”变成可检查的证据

让 Codex 修 bug 最容易出问题的环节，不是它不会写代码，而是验收标准在过程中被悄悄改掉：测试被改宽、断言被删、或者顺手重构了半个模块。一个可靠的流程是先把失败测试固定下来，再限制修改范围，最后用测试结果和 diff 两条证据验收。

本文的示例不依赖任何第三方包，也不需要先调用模型就能复现失败。你可以先离线跑一遍，确认测试确实在测正确的东西，再决定是否把它交给 Codex。

## 前置条件

- Node.js 20 以上，本文示例实际在 v24.11.0 下运行。
- 已安装并登录 Codex CLI；如果只想验证示例，可跳过 Codex 部分。
- 一个干净的 Git 工作区。先提交基线，后面才能看清 Codex 到底改了什么。

## 第一步：建立最小失败用例

创建目录和三个文件：

```bash
mkdir -p slug-demo/src
cd slug-demo
```

`package.json`：

```json
{
  "name": "slug-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`src/slug.js` 先放一个有缺陷的实现：

```js
export function slugify(input) {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}
```

`src/slug.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("separates words at punctuation", () => {
  assert.equal(slugify(" Hello, world! "), "hello-world");
});

test("collapses repeated spaces", () => {
  assert.equal(slugify("a   b"), "a-b");
});

test("is idempotent", () => {
  assert.equal(slugify(slugify("Hello, world!")), "hello-world");
});
```

这三个测试分别覆盖标点、连续空格和幂等性。它们不是“模型生成的测试”，而是任务开始前就存在的验收合同。独立的意思是：测试先于修复存在，并且由你确认过它表达的是需求。

## 第二步：先离线复现失败

```bash
npm test
```

预期结果（实际运行摘录）：

```text
✖ separates words at punctuation
✔ collapses repeated spaces
✖ is idempotent
ℹ tests 3
ℹ pass 1
ℹ fail 2

+ actual - expected
+ 'hello,-world!'
- 'hello-world'
```

退出码为 1。失败原因很具体：当前实现只把空白替换成连字符，没有处理逗号、感叹号，也没有去掉首尾连字符。先看懂这个原因，再写提示词；否则你只能把“测试失败”原样丢给模型，无法判断它的修复是否偏离需求。

此时这些文件还没有进版本库。先把“能复现失败”的状态提交成基线；否则后面的 `git diff` 分不清哪些是你写的、哪些是 Codex 改的：

```bash
git init
git add package.json src/slug.js src/slug.test.js
git commit -m "test: reproduce slug failures"
```

## 第三步：给 Codex 一个受限任务

在仓库根目录启动可写会话：

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

提示词要同时包含目标、允许范围和禁止项：

```text
src/slug.test.js 目前有 2 个失败。请先解释根因，然后只修改 src/slug.js，
让 3 个测试全部通过。不要修改测试文件，不要新增依赖，不要改 package.json。
完成后运行 npm test，并展示 git diff。
```

预期行为（示意）：Codex 读取两个文件，指出正则只处理空白；然后提出对 `slug.js` 的修改；执行测试；最后展示 diff。若它试图改测试或新增依赖，立即停止并收紧指令。审批出现时，先看具体命令，不要连续确认。

一个符合约束的修复是：

```js
export function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

## 第四步：验收测试和 diff，而不是只看总结

先跑回归：

```bash
npm test
```

预期结果：3 个测试全部通过，退出码为 0。然后看改动范围（基线已提交，这里只会显示 Codex 的修改）：

```bash
git diff --stat
git diff -- src/slug.js
git status --short
```

合格的 diff 应满足：只改 `src/slug.js`；测试文件没有变化；没有新增依赖或锁文件；没有格式化整个仓库。若 Codex 还改了其他文件，先问清楚原因，再决定保留还是丢弃。不要用“测试过了”代替 diff 审查，测试通过只说明现有断言被满足。

这个修复也有明确边界：它只保留 ASCII 字母和数字，中文或带重音的字符会被删掉。它适合演示，不是通用 slug 库。真实项目应先明确字符集，再补相应测试；补测试是另一个独立改动，不应混进这次“只修实现”的任务。

## 第五步：把离线结果留作基线

本文示例已离线运行并保存结果：修复前 1 通过、2 失败，退出码 1；修复后 3 通过、0 失败，退出码 0。diff 只包含 `src/slug.js`。这些结果不依赖模型，可用于验证测试本身是否可靠；真正让 Codex 执行时，仍应重新跑一遍，而不是引用旧输出。

## 常见失败与诊断

**1. 测试通过但行为仍不对。** 说明测试覆盖不足，或断言写得太宽。不要为了让 Codex“通过”而改测试；先补一个能表达缺失需求的失败测试，再重新走流程。若测试本身就是错的，单独修正测试并说明理由，不要和实现修改混在一起。

**2. Codex 修改了测试文件。** 检查 `git diff -- src/slug.test.js`。哪怕只是调整了期望值，也要拒绝这次改动。最稳妥的做法是回到已提交的基线重来，而不是在被动过的测试上继续修。

**3. `node --test` 找不到测试或报模块错误。** 确认 Node 版本、`package.json` 中的 `"type": "module"`，以及测试文件是否在默认匹配范围内。Node 内置测试运行器对文件名和目录有约定；不要急着装 Jest 或 Vitest 来“解决”。

**4. 测试命令在 Windows 上行为不同。** PowerShell 中同样执行 `npm test`，但路径和换行可能影响脚本。若测试文件是 CRLF 且脚本带 shebang，先按 [Windows 环境](/articles/codex-windows-setup/) 的换行规则处理。不要在 PowerShell 中直接套用 Linux 的 `chmod` 或 `/bin/sh` 命令。

**5. Codex 的改动范围越来越大。** 先提交当前基线，要求它只改一个文件；把“解释根因”和“实施修复”分成两轮。范围失控时不要用 `git reset --hard` 一把清空，先保存 diff 或提交到临时分支，确认没有需要保留的内容再处理。

## 验收清单

- [ ] 修复前独立运行测试，确认失败原因与需求一致。
- [ ] 提示词写明了允许修改的文件和禁止项。
- [ ] 修复后 3 个测试全部通过，退出码为 0。
- [ ] `git diff` 只包含预期实现文件，测试和依赖未变。
- [ ] 能说出这个修复的字符集限制，没有把它当成通用方案。
- [ ] 没有用修改测试或跳过断言来制造“通过”。

## 接下来

理解为什么写操作需要工作区权限，可以回看 [Codex 权限](/articles/codex-permissions/)。如果要把这套“测试—退出码—diff”搬进无人值守流程，读 [Codex 非交互模式](/articles/codex-noninteractive/)。

## 参考来源

- [Codex CLI 官方文档](https://learn.chatgpt.com/docs/codex/cli)
- [Codex 沙箱与审批](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Node.js 内置测试运行器](https://nodejs.org/api/test.html)

核验范围（2026-11-14）：Node 测试示例在 Node v24.11.0 下实际运行，失败与通过结果、退出码和 diff 范围均来自本地离线执行。Codex 的交互行为未在本文中声称实际跑过；参数以本机 `codex --help` 为准。