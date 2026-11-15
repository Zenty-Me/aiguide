---
title: "Codex CLI 第一次任务：从一条指令到测试验收"
description: "用一个能跑测试的最小仓库走完 Codex CLI 完整链路：只读理解、下达约束、审阅 diff、跑 node --test 验收，并给出卡住时的排查顺序。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 入门
order: 40
tags: ["Codex", "CLI", "工作流", "代码审阅"]
featured: true
---

## 目标：跑通“指令 → 改动 → 验收”的闭环

第一次用编码 Agent，最容易犯的错是把范围放得太大：一句“帮我优化这个项目”，换来一堆看不懂的 diff，最后只能靠感觉判断对不对。

本文只做一件事：在一个空仓库里补一个 `slugify` 函数和四条测试，然后跑通 `node --test`。任务小到 diff 一眼能看完，失败原因也容易定位。真正要练的不是“让它写代码”，而是**你怎么验收它写的代码**。

## 前置条件

- Node.js 20 或更高版本（自带 `node --test` 测试运行器，无需安装 Jest 之类依赖）
- 已安装 Codex CLI，并完成登录，终端里执行 `codex` 能进入交互界面
- 一个可以随便改的本地目录，不要拿生产仓库练手
- 会用 `git status` 和 `git diff` 读改动

命令以 Codex CLI 的稳定行为为准。`--sandbox`、审批策略这类参数在不同版本间会调整，动手前先看 `codex --help` 与 `codex exec --help` 的实际输出，不要照抄旧博客。

## 步骤一：准备一个能回滚、也能审阅的基线

```bash
mkdir codex-first-task && cd codex-first-task
git init
mkdir -p src

cat > package.json <<'EOF'
{ "name": "codex-first-task", "private": true, "type": "module" }
EOF

cat > src/text.js <<'EOF'
export function normalizeTitle(input) {
  return input.trim().replace(/\s+/g, " ");
}
EOF

git add -A
git commit -m "chore: baseline"
```

两个细节决定后面能不能审阅：

**第一，基线必须是真实提交，不能只有 `git commit --allow-empty`。** 空提交之后 `src/text.js` 是未跟踪文件，而 `git diff` **不显示未跟踪文件**——你看到的 diff 只有 Codex 新改的部分，看不到它改之前长什么样，也就无法判断它有没有顺手动了别的地方。

**第二，`package.json` 里必须有 `"type": "module"`。** 文件用 `export` / `import` 却按 CommonJS 解析时，Node 20 会直接报错：

```text
SyntaxError: Cannot use import statement outside a module
```

注意：较新的 Node 版本会自动探测 ESM 语法（本机 Node 24 上删掉 `"type": "module"` 仍然能跑），所以在较新的 Node 上不加 `type` 也可能“碰巧能跑”。这说明**你本机跑通不代表读者能跑通**，声明要写死。

提交后确认基线干净：

```bash
git status --short   # 无输出
git log --oneline    # 只有一条 chore: baseline
```

## 步骤二：先让它读，再让它改

进入目录执行 `codex`，第一条消息只做阅读：

```text
只读任务：阅读 src/text.js，用三句话说明它做了什么、有哪些边界情况；
如果要新增 slugify(input)，代码应该放在哪里。不要修改任何文件。
```

确认它的理解和你一致，再下达修改指令。一次说清四件事：改哪个文件、函数签名、行为约束、怎么验证。

```text
在 src/text.js 中新增并导出 slugify(input)：
- 先复用 normalizeTitle，再统一转成小写
- 把连续空白替换为单个 -，去掉首尾的 -
- 删除字母、数字、- 之外的字符
- 输入为空字符串时返回空字符串

同时新增 src/text.test.js，用 node:test 覆盖四种输入：
普通句子、多余空格、首尾空格、空字符串。
完成后运行 node --test，把完整输出贴给我。
```

它应该产出的测试文件（可直接对照）：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./text.js";

test("普通句子", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("多余空格", () => {
  assert.equal(slugify("Hello    World"), "hello-world");
});

test("首尾空格与标点", () => {
  assert.equal(slugify("  Hello, World  "), "hello-world");
});

test("空字符串", () => {
  assert.equal(slugify("   "), "");
});
```

## 步骤三：用 diff 和测试验收，不要看它的总结

```bash
git status --short
git diff --stat
node --test
```

这里有个坑必须先讲：**`git diff` 只显示已跟踪文件的改动，新增文件默认不可见。** 实测输出：

```text
$ git status --short
 M src/text.js
?? src/text.test.js

$ git diff --stat
 src/text.js | 8 ++++++++
 1 file changed, 8 insertions(+)
```

测试文件 19 行完全没出现。要审阅新增文件，二选一：

```bash
# 方案一：intent-to-add，只登记路径不暂存内容，之后 git diff 就能看到
git add -N src/text.test.js
git diff --stat
# src/text.js      |  8 ++++++++
# src/text.test.js | 19 +++++++++++++++++++

# 方案二：全部暂存后看 staged diff
git add -A && git diff --cached
```

`git add -N` 只是让 diff 认得这个新文件，不影响测试运行；用完想撤销就 `git reset src/text.test.js`。

三样各回答一个不同的问题：

- `git status --short`：只应出现 `M src/text.js` 和 `?? src/text.test.js`。多出 `.env`、配置文件或莫名重命名，先问清楚再继续。
- `git diff`（含 `-N` 之后的新文件）：新增逻辑是否只碰了你说的地方，有没有顺手改格式、注释掉旧代码、引入新依赖。
- `node --test`：通过数应该是 4。实测输出：

```text
✔ 普通句子 (0.6854ms)
✔ 多余空格 (0.154ms)
✔ 首尾空格与标点 (0.0913ms)
✔ 空字符串 (0.9191ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

**`tests 0` 是最危险的输出**：测试文件命名不符合默认模式（例如写成 `tests/text.js`）时，runner 一个都没找到，打印 `tests 0 / pass 0 / fail 0` 并且 **退出码是 0**。CI 不会报错，你会以为测试通过了。验收时先确认 `tests 4`，再谈别的。

这里的验收标准可以提前固定下来：四条测试全绿、diff 只涉及两个文件、`slugify("  Hello, World  ")` 返回 `hello-world`。最后一条可以在 `node -e` 里手敲一遍，不依赖它写的测试。

```bash
node -e "import('./src/text.js').then(m => console.log(m.slugify('  Hello, World  ')))"
```

## 验收标准

1. `node --test` 输出 `tests 4`、`pass 4`、`fail 0`，四个用例名都在输出里；
2. `git status --short` 只有 `M src/text.js` 与 `?? src/text.test.js`，且 `git add -N` 后 `git diff --stat` 显示 2 个文件；
3. 手工构造的一个边界输入结果符合预期；
4. 你能用自己的话解释新增函数的每一步，而不是“它写的就是对的”。

## 常见错误

- **一上手就让它重构整个仓库。** diff 超过一屏就开始失去验收能力，先从小任务建立判断力。
- **把“已完成”当结论。** Agent 的自我报告不是证据，测试输出和 diff 才是。
- **用空提交当基线。** `git diff` 看不到未跟踪的原始文件，出问题时分不清“它改的”和“本来就有的”。
- **看着 `git diff` 说“只改了一个文件”。** 新增文件在被 `git add -N` 之前不进普通 diff；单独看 `git diff --cached` 也看不到未跟踪文件。先登记意图再 `git diff -- src/text.test.js`，或暂存后看 `git diff --cached -- src/text.test.js`。
- **漏写 `"type": "module"`。** Node 20 会以 `SyntaxError: Cannot use import statement outside a module` 失败。
- **只看“测试全绿”不看数量。** `tests 0` 也是绿的，退出码还是 0。
- **直接关掉审批和沙箱。** 第一次任务就跳过确认，等于放弃了唯一的人工检查点；隔离环境之外不要这么做。
- **只写测试不写断言。** 测试能跑通但什么都没验证，比没有测试更危险。

## 卡住时按这个顺序排查

上面的失败模式都有可观察的信号，别急着换模型或换工具，先确认是哪一层出了问题：

1. **`node --test` 打印 `tests 0`。** 先看测试文件名：默认只匹配 `*.test.js` 这类模式。文件放在 `tests/text.js` 不会被自动发现；改回 `src/text.test.js`，或把路径显式传给 runner。
2. **`git diff` 里没有新测试文件。** `git status --short` 出现 `??` 说明文件还未被跟踪，`git diff` 默认不比较未跟踪文件；`git diff --cached` 只显示已暂存的改动，单独执行同样看不到它。想审内容有两条路：先 `git add -N src/text.test.js`（只登记意图，不暂存内容），再 `git diff -- src/text.test.js`；或者 `git add src/text.test.js` 暂存后再 `git diff --cached -- src/text.test.js`。前者不改暂存区，后者会，按需要选。
3. **导入时报 `SyntaxError: Cannot use import statement outside a module`。** 检查 `package.json` 是否有 `"type": "module"`；也可以改用 `.mjs` 扩展名，但那会改变文章里的文件命名，先统一约定再改。
4. **让它改文件，结果什么都没变。** 看终端里是否有沙箱只读或审批被拒的提示。先在可丢弃的目录里确认自己能写，再决定是否提高权限；不要用跳过沙箱的方式来验证权限问题。
5. **参数和本文不一样。** `--sandbox`、审批策略这类参数会随版本调整，以本机 `codex --help` 与 `codex exec --help` 的输出为准，不照抄旧示例。

排查完只需要回答两个问题：改动是否可回滚、验收命令是否真的跑过。两个答案都是“是”，再继续下一个任务。

## 接下来读什么

- 想把测试命令、目录约定固定下来，避免每次重复交代 → [Codex 项目上下文：AGENTS.md 写什么、config.toml 边界在哪](/articles/codex-project-context/)
- 想让另一个 Agent 独立评审这次改动 → [Claude Code 代码评审：用 /review 和 hooks 做成独立工序](/articles/claude-code-review/)
- 想理解它为什么反复调工具、什么时候必须强制停下 → [Agent 工具循环：重复调用、超时与失败预算怎么停](/articles/agent-tool-loop/)

## 参考来源

- Codex CLI 概览：<https://learn.chatgpt.com/docs/codex/cli.md>
- Codex 非交互模式：<https://learn.chatgpt.com/docs/non-interactive-mode.md>
- Codex 沙箱与审批预设：openai/codex 仓库 `docs/sandbox.md`
- Node.js 内置测试运行器：<https://nodejs.org/api/test.html>
