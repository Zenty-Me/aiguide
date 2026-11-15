---
title: "Skill 资源拆分：references、scripts 与按需加载"
description: "把 change-summary 拆成 SKILL.md、references、assets 和离线脚本，理解渐进加载、路径与工作目录，并跑通自测。"
category: "skills"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 330
tags: ["Agent Skills", "渐进加载", "Node.js"]
featured: false
---

第一个 Skill 能跑之后，最常见的下一步是把所有东西塞进 `SKILL.md`：检查清单、输出模板、一个解析脚本，最后正文变成几千字。Agent Skills 的设计意图正好相反：元数据常驻，正文在激活时加载，参考资料和执行脚本按需读取。本文把 `change-summary` 拆成四类资源，并用一个不联网、不调用模型的 Node 脚本验证拆分后的路径和输出。

## 前置条件

- 已完成 [第一个 Agent Skill](/articles/skills-first-skill/)，知道 `SKILL.md` 的 frontmatter 和发现路径；结构设计见 [Agent Skills 设计](/articles/skills-design/)，团队分发见 [团队 Skill 工作流](/articles/skills-team-workflow/)。
- Node.js 20 或更高版本；本文脚本只使用 `node:fs`、`node:assert`、`node:url` 等内置模块。本地用 v24.11.0 验证。
- 一个 Git 仓库和一段可导出的 diff。脚本只读文件，不执行 Git 写操作。

## 目录：四类资源各归其位

```text
.claude/skills/change-summary/
├── SKILL.md
├── scripts/
│   └── collect-change-facts.mjs
├── references/
│   ├── review-checklist.md
│   └── sample.diff
└── assets/
    └── summary-template.md
```

- `scripts/` 放可执行助手。它不会被自动运行，只有模型或人显式调用命令时才执行。
- `references/` 放需要时才读的说明、检查清单和样例。它们不会自动进入上下文。
- `assets/` 放输出时要用的模板或素材。它们也不会自动加载，需要显式读取。
- `SKILL.md` 只保留触发条件、流程和“何时读哪个资源”。

### 先拿到这五个文件

上面的目录不是示意，而是本文测试过的完整 Skill。五个文件都可以直接下载，按下表保存到项目里（也可以在项目根目录用后面的命令一次拉取）：

| 文件 | 下载 | 保存到 |
| --- | --- | --- |
| Skill 说明 | [`SKILL.md`](/examples/change-summary/SKILL.md) | `.claude/skills/change-summary/SKILL.md` |
| 事实收集脚本 | [`collect-change-facts.mjs`](/examples/change-summary/scripts/collect-change-facts.mjs) | `.claude/skills/change-summary/scripts/collect-change-facts.mjs` |
| 评审清单 | [`review-checklist.md`](/examples/change-summary/references/review-checklist.md) | `.claude/skills/change-summary/references/review-checklist.md` |
| 示例 diff | [`sample.diff`](/examples/change-summary/references/sample.diff) | `.claude/skills/change-summary/references/sample.diff` |
| 摘要模板 | [`summary-template.md`](/examples/change-summary/assets/summary-template.md) | `.claude/skills/change-summary/assets/summary-template.md` |

浏览器若把文件直接打开而不是下载，用右键“链接另存为”，保持原文件名。批量下载版：

```bash
BASE=https://aiguide.zenty.top/examples/change-summary
for f in SKILL.md scripts/collect-change-facts.mjs references/review-checklist.md references/sample.diff assets/summary-template.md; do
  mkdir -p ".claude/skills/change-summary/$(dirname "$f")"
  curl -fsSL "$BASE/$f" -o ".claude/skills/change-summary/$f"
done
```

规范建议正文控制在 500 行、约 5000 tokens 以内；元数据约 100 tokens 常驻，正文在激活时整体加载，资源则按需读取。这个分层不是“为了整齐”，而是直接决定每次调用的上下文成本。

## SKILL.md 只做导航

拆分后的 `SKILL.md` 可以写成这样（可直接[下载完整文件](/examples/change-summary/SKILL.md)）：

```markdown
---
name: change-summary
description: Summarize a Git diff as a change summary, PR description, or release note. Use when the user asks what changed, requests a PR summary, or needs a review-ready change list with verification gaps.
license: MIT
compatibility: Requires Git and Node.js 20 or newer.
metadata:
  version: "1.0.0"
---

# Change summary

## Procedure

1. Establish the base and head revisions. If either is unknown, ask; do not guess.
2. Create the diff outside the conversation:
   `git diff <base>...<head> > /tmp/change.diff`
3. Run the helper from the repository root:
   `node .claude/skills/change-summary/scripts/collect-change-facts.mjs --diff /tmp/change.diff --pretty`
4. Read `references/review-checklist.md` only when the JSON contains
   `SENSITIVE_PATH_NAMES`, `MIGRATION_CHANGED`, `LOCKFILE_CHANGED`, or
   `TESTS_NOT_CHANGED`.
5. Read `assets/summary-template.md` and fill its sections.
6. Separate "verified by this run" from "not verified".

## Boundaries

- Read-only: do not commit, push, deploy, or rewrite history.
- Do not claim a test passed because a test file changed.
- If the helper fails, report its error code and stop.
```

注意第 3 步的命令：它假设 Skill 安装在项目级 `.claude/skills/change-summary`，并且 shell 当前目录是仓库根目录。若安装在个人级 `~/.claude/skills/...`，命令前缀要换成实际路径；相对引用 `references/...` 是相对 Skill 根目录解析的，不是相对 shell 的当前目录。

## 脚本：确定性、离线、只读

脚本的目标不是“智能总结”，而是把 diff 中可计数的事实固定下来：改了哪些文件、增删多少行、是否碰测试/文档/锁文件/迁移、是否有敏感路径名。它不访问网络、不读环境变量、不调用模型，输出字段顺序稳定，适合重复运行。

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

class FactsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function parseArgs(argv) {
  const args = { diff: null, stdin: false, pretty: false, selfTest: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--diff") {
      args.diff = argv[++index];
      if (!args.diff) throw new FactsError("USAGE", "--diff requires a file path");
    } else if (arg === "--stdin") {
      args.stdin = true;
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new FactsError("USAGE", `unknown argument: ${arg}`);
    }
  }
  if (args.diff && args.stdin) throw new FactsError("USAGE", "use either --diff or --stdin");
  return args;
}

const isTestPath = (path) =>
  /(^|\/)(tests?|__tests__|spec)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path);
const isDocsPath = (path) => /(^|\/)docs?\//i.test(path) || /\.mdx?$/i.test(path);
const isLockfilePath = (path) =>
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock)$/i.test(
    path,
  );
const isMigrationPath = (path) => /(^|\/)(migrations?|migrate)\//i.test(path) || /\.sql$/i.test(path);
const isCiPath = (path) => /^\.github\/workflows\//.test(path);
const isSensitivePath = (path) =>
  /(^|\/)(\.env(\..*)?|secrets?|credentials?)(\/|$)/i.test(path) || /\.(pem|key|p12|pfx)$/i.test(path);

function emptyFacts(path) {
  return { path, status: "modified", additions: 0, deletions: 0, binary: false };
}

// Git C-quotes paths with non-ASCII or control bytes and escapes each UTF-8 byte,
// so the decoded result has to be assembled as bytes before it becomes a string.
const ASCII_ESCAPES = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '"': 0x22,
  "\\": 0x5c,
};

function unquoteGitPath(raw) {
  const bytes = [];
  for (let index = 1; index < raw.length - 1; index += 1) {
    const char = raw[index];
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const octal = raw.slice(index + 1, index + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8));
      index += 3;
      continue;
    }
    const escape = raw[index + 1];
    if (escape !== undefined && Object.hasOwn(ASCII_ESCAPES, escape)) {
      bytes.push(ASCII_ESCAPES[escape]);
      index += 1;
      continue;
    }
    throw new FactsError("INVALID_DIFF", `unsupported escape in quoted path: ${raw}`);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function readQuotedToken(text, start) {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === '"') {
      return { value: unquoteGitPath(text.slice(start, index + 1)), end: index + 1 };
    }
    index += 1;
  }
  throw new FactsError("INVALID_DIFF", "unterminated quoted path in diff header");
}

const stripPrefix = (path, prefix) => (path.startsWith(prefix) ? path.slice(prefix.length) : path);

function parseGitHeader(line) {
  const rest = line.slice("diff --git ".length);
  if (rest.startsWith('"')) {
    const oldToken = readQuotedToken(rest, 0);
    const remainder = rest.slice(oldToken.end);
    if (!remainder.startsWith(' "')) throw new FactsError("INVALID_DIFF", `cannot parse diff header: ${line}`);
    const newToken = readQuotedToken(remainder, 1);
    if (newToken.end !== remainder.length) {
      throw new FactsError("INVALID_DIFF", `unexpected trailing text in diff header: ${line}`);
    }
    return { oldPath: stripPrefix(oldToken.value, "a/"), newPath: stripPrefix(newToken.value, "b/") };
  }
  const match = rest.match(/^a\/(.+?) b\/(.+)$/);
  if (!match) throw new FactsError("INVALID_DIFF", `cannot parse diff header: ${line}`);
  return { oldPath: match[1], newPath: match[2] };
}

export function collectFacts(diffText) {
  if (typeof diffText !== "string" || diffText.trim() === "") {
    throw new FactsError("INVALID_DIFF", "diff is empty");
  }
  const text = diffText.replace(/\r\n/g, "\n");
  if (!/^diff --git /m.test(text)) {
    throw new FactsError("INVALID_DIFF", "expected the default output of git diff");
  }

  const byPath = new Map();
  let current = null;
  let inHunk = false;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = emptyFacts(parseGitHeader(line).newPath);
      byPath.set(current.path, current);
      inHunk = false;
      continue;
    }
    if (line.startsWith("diff ")) {
      throw new FactsError("INVALID_DIFF", `unsupported diff header: ${line}`);
    }
    if (!current) continue;
    if (line.startsWith("new file mode ")) {
      current.status = "added";
    } else if (line.startsWith("deleted file mode ")) {
      current.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      current.status = "renamed";
    } else if (line.startsWith("Binary files ")) {
      current.binary = true;
    } else if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && line.startsWith("+")) {
      current.additions += 1;
    } else if (inHunk && line.startsWith("-")) {
      current.deletions += 1;
    }
  }

  const files = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  if (files.length === 0) throw new FactsError("INVALID_DIFF", "no file headers found");

  const paths = files.map((file) => file.path);
  const testsTouched = paths.some(isTestPath);
  const docsTouched = paths.some(isDocsPath);
  const codeTouched = paths.some(
    (path) => !isDocsPath(path) && !isTestPath(path) && !isCiPath(path) && !isLockfilePath(path),
  );
  const lockfileTouched = paths.some(isLockfilePath);
  const migrationsTouched = paths.some(isMigrationPath);
  const ciTouched = paths.some(isCiPath);
  const sensitivePaths = paths.filter(isSensitivePath);

  const warnings = [];
  if (sensitivePaths.length > 0) {
    warnings.push({
      code: "SENSITIVE_PATH_NAMES",
      message: "path names look sensitive; inspect before sharing this summary",
      paths: sensitivePaths,
    });
  }
  if (codeTouched && !testsTouched) {
    warnings.push({ code: "TESTS_NOT_CHANGED", message: "code changed but no test file changed" });
  }
  if (lockfileTouched) {
    warnings.push({ code: "LOCKFILE_CHANGED", message: "dependency lockfile changed; review the diff" });
  }
  if (migrationsTouched) {
    warnings.push({ code: "MIGRATION_CHANGED", message: "migration changed; review rollback and backfill" });
  }

  return {
    files,
    totals: {
      files: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    },
    flags: {
      codeTouched,
      testsTouched,
      docsTouched,
      docsOnly: files.length > 0 && paths.every(isDocsPath),
      lockfileTouched,
      migrationsTouched,
      ciTouched,
      sensitivePaths,
    },
    warnings,
  };
}

function assertFacts() {
  const sample = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,3 @@
 const a = 1;
-old
+new
+extra
diff --git a/tests/app.test.js b/tests/app.test.js
new file mode 100644
--- /dev/null
+++ b/tests/app.test.js
@@ -0,0 +1,2 @@
+test("x", () => {});
+// ok
diff --git a/docs/guide.md b/docs/guide.md
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1 +1 @@
-old docs
+new docs`;
  const facts = collectFacts(sample);
  assert.equal(facts.totals.files, 3);
  assert.deepEqual(facts.files.map((file) => file.path), ["docs/guide.md", "src/app.js", "tests/app.test.js"]);
  assert.deepEqual(
    { additions: facts.files.find((file) => file.path === "src/app.js").additions, deletions: facts.files.find((file) => file.path === "src/app.js").deletions },
    { additions: 2, deletions: 1 },
  );
  assert.equal(facts.files.find((file) => file.path === "tests/app.test.js").status, "added");
  assert.equal(facts.flags.testsTouched, true);
  assert.equal(facts.flags.docsOnly, false);
  assert.equal(facts.warnings.some((warning) => warning.code === "TESTS_NOT_CHANGED"), false);

  const codeOnly = collectFacts(`diff --git a/src/only.js b/src/only.js
--- a/src/only.js
+++ b/src/only.js
@@ -1 +1 @@
-a
+b`);
  assert.equal(codeOnly.warnings.some((warning) => warning.code === "TESTS_NOT_CHANGED"), true);
  assert.equal(codeOnly.flags.testsTouched, false);

  const secret = collectFacts(`diff --git a/config/.env.production b/config/.env.production
--- a/config/.env.production
+++ b/config/.env.production
@@ -1 +1 @@
-OLD=1
+NEW=2`);
  assert.deepEqual(secret.flags.sensitivePaths, ["config/.env.production"]);

  const quoted = collectFacts(`diff --git "a/docs/中文.md" "b/docs/中文.md"
--- "a/docs/中文.md"
+++ "b/docs/中文.md"
@@ -1 +1 @@
-a
+b`);
  assert.deepEqual(quoted.files.map((file) => file.path), ["docs/中文.md"]);
  assert.equal(quoted.totals.additions, 1);
  assert.throws(() => collectFacts("diff --git unparseable b/header\n+x"), (error) => error.code === "INVALID_DIFF");

  assert.throws(() => collectFacts(""), (error) => error.code === "INVALID_DIFF");
  assert.throws(() => collectFacts("not a git diff"), (error) => error.code === "INVALID_DIFF");
  assert.throws(() => parseArgs(["--diff"]), (error) => error.code === "USAGE");
  assert.throws(() => parseArgs(["--unknown"]), (error) => error.code === "USAGE");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function usage() {
  return [
    "Usage:",
    "  node collect-change-facts.mjs --diff <file> [--pretty]",
    "  git diff | node collect-change-facts.mjs --stdin [--pretty]",
    "  node collect-change-facts.mjs --self-test",
    "",
    "Reads a git diff and prints JSON facts. Does not call a model or the network.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.selfTest) {
    assertFacts();
    console.log("self-test ok (17 assertions)");
    return 0;
  }
  if (!args.diff && !args.stdin) throw new FactsError("USAGE", "provide --diff or --stdin");
  const diff = args.stdin ? await readStdin() : readFileSync(args.diff, "utf8");
  const facts = collectFacts(diff);
  console.log(JSON.stringify({ ok: true, facts }, null, args.pretty ? 2 : 0));
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          ok: false,
          error: { code: error.code ?? "ERROR", message: error.message },
        }),
      );
      process.exitCode = 2;
    });
}
```

脚本的 CLI 入口、`--self-test`、从 stdin 读取和错误包装都在同一文件里。核心原则只有两条：**stdout 只输出 JSON**，诊断信息走 stderr；**输入不符合 `git diff` 默认格式就明确拒绝**，不要猜测。

“明确拒绝”也包括路径形式：Git 默认会给含非 ASCII 字符的路径加引号并转义为 `"a/docs/\344\270\255\346\226\207.md"` 这样的字节序列。解析器按 Git 的 C 引号规则解码后再统计，遇到无法识别的 `diff` 头（例如 `diff --cc` 合并 diff）直接返回 `INVALID_DIFF`，不会把后续 `+`/`-` 行错算到上一个文件。

## 实际运行与输出

以下命令按 Skill 安装到项目后的 `.claude/skills/change-summary` 路径书写；没有安装也可以先用本文的公开副本验证，把路径换成 `public/examples/change-summary` 即可。

在仓库根目录运行自测：

```bash
node .claude/skills/change-summary/scripts/collect-change-facts.mjs --self-test
```

本地实际输出（Node v24.11.0）：

```text
self-test ok (17 assertions)
```

自测覆盖三类容易出错的输入：正常多文件 diff（状态、增删行、测试/文档/敏感路径标记）、Git 加引号的中文路径、以及无法解析的文件头。所有断言都是本机离线执行，不联网、不调用模型。

用示例 diff 运行：

```bash
node .claude/skills/change-summary/scripts/collect-change-facts.mjs \
  --diff .claude/skills/change-summary/references/sample.diff --pretty
```

实际输出节选：

```json
{
  "ok": true,
  "facts": {
    "files": [
      { "path": "docs/usage.md", "status": "modified", "additions": 2, "deletions": 1, "binary": false },
      { "path": "src/summary.js", "status": "modified", "additions": 2, "deletions": 1, "binary": false },
      { "path": "tests/summary.test.js", "status": "modified", "additions": 1, "deletions": 0, "binary": false }
    ],
    "totals": { "files": 3, "additions": 5, "deletions": 2 },
    "flags": {
      "codeTouched": true,
      "testsTouched": true,
      "docsTouched": true,
      "docsOnly": false,
      "lockfileTouched": false,
      "migrationsTouched": false,
      "ciTouched": false,
      "sensitivePaths": []
    },
    "warnings": []
  }
}
```

传入非 diff 文本时，实际输出：

```json
{"ok":false,"error":{"code":"INVALID_DIFF","message":"expected the default output of git diff"}}
```

进程退出码为 2。这个错误不是“脚本崩了”，而是输入契约不满足；应在调用方修正输入。

## 自动加载与显式引用

| 资源 | 何时进入上下文/执行 | 是否自动 |
| --- | --- | --- |
| `SKILL.md` frontmatter | 客户端启动时读取元数据 | 是 |
| `SKILL.md` 正文 | Skill 被激活时整体加载 | 是 |
| `references/*.md` | 模型按正文指示读取 | 否 |
| `assets/*` | 生成输出时显式读取 | 否 |
| `scripts/*` | 人或模型执行命令 | 否 |

“打包了脚本”不等于“脚本会被执行”，更不等于“可以安全执行”。来自不受信任来源的 Skill，运行前要读脚本，确认它没有网络请求、删除操作或读取密钥；本文脚本只读 diff 文件。

## 路径与工作目录

三个路径容易混淆：

1. **Skill 内相对引用**：正文里的 `references/review-checklist.md` 相对 Skill 根目录，由客户端解析。
2. **Shell 工作目录**：`--diff .claude/...` 相对执行命令的当前目录；从子目录运行时可能 `ENOENT`。
3. **脚本内部路径**：脚本只用传入的路径，不假设自己位于 Skill 根目录；因此可以从任意 cwd 用绝对路径调用。

最稳妥的约定是：从仓库根目录执行，diff 用绝对路径或明确的仓库相对路径；在 `SKILL.md` 里写清这个前提。

## 验收标准

- `SKILL.md` 只保留触发、流程和资源导航；详细清单在 `references/`，模板在 `assets/`，可执行逻辑在 `scripts/`。
- 脚本无网络、无模型、无时间依赖；同一输入输出稳定。
- `--self-test` 通过，非法输入以非零码和结构化错误失败。
- 从仓库根目录、子目录、绝对路径三种方式中，至少验证两种路径行为。
- 资源被移动后，`SKILL.md` 中所有相对引用仍能解析。
- 明确记录“脚本不会自动执行”。

## 常见错误与诊断

- **`ENOENT: no such file or directory`**：`--diff` 是相对 shell cwd 的，不是相对 Skill 目录；用绝对路径或先 `cd` 到仓库根目录。
- **`INVALID_DIFF`，但文件确实是 diff**：可能用了 `diff -u` 或 `git diff --no-index`，没有 `diff --git` 头；本脚本只接受 Git 默认格式，换格式需要扩展解析器。
- **stdout 出现日志，JSON 解析失败**：脚本里任何 `console.log` 都会污染输出；调试信息写 `console.error`。
- **移动 Skill 后引用失效**：正文仍写旧的相对路径，或把 `scripts/` 放到了 Skill 根目录之外；从 Skill 根目录重新核对每个相对引用。
- **自测通过就以为覆盖所有 diff**：二进制、重命名、带空格的路径只做了有限处理；把限制写进 Skill 和测试，不要宣称通用。

## 参考来源

- Agent Skills Specification（渐进加载、目录与资源约束）：https://agentskills.io/specification
- Claude Code Skills（支持文件与项目/个人路径）：https://code.claude.com/docs/en/skills

官方资料核对日期：2026-11-14。脚本与输出在本地 Node v24.11.0 实际运行；未调用模型，未在 Claude Code 中验证自动触发。