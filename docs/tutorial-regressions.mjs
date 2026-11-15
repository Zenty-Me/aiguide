#!/usr/bin/env node
/**
 * 教程代码片段定点回归：从 src/content/articles/*.md 里把代码块原样抽出来，就地运行，
 * 验证文章声称的行为确实成立——而不是维护一份和正文无关的副本。
 *
 * 用法（仓库根目录）：node docs/tutorial-regressions.mjs
 * 退出码：0 全部通过；1 有失败。
 *
 * 依赖：Node 18+、bash、git。第 1 项还需要仓库里的 typescript（astro 的传递依赖）。
 * 说明：涉及 shell 的检查整体交给一个 bash 脚本来跑，避免 Windows 版 node.exe 与
 * WSL/Linux 的 /tmp 视图不一致导致同一路径在两边指向不同目录。
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articles = path.join(root, "src/content/articles");
const failures = [];

// 工作目录：优先 /tmp 的 Windows 视图（D:/tmp），再退回系统临时目录
const WORKROOT = existsSync("D:/tmp") ? "D:/tmp" : tmpdir();
const WORK = mkdtempSync(path.join(WORKROOT, "zenty-regress-"));
// bash 侧看到的等价路径
const WORK_POSIX = WORK.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);

function article(name) {
  return readFileSync(path.join(articles, name), "utf8");
}

/** 取出指定语言的代码块，用 needle 精确定位（要求唯一，避免依赖块序号）。 */
function pickBlock(name, lang, needle) {
  const blocks = [...article(name).matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
  const hit = blocks.filter((b) => b.includes(needle));
  if (hit.length !== 1) throw new Error(`${name}: 期望恰好 1 个含「${needle}」的 ${lang} 块，实际 ${hit.length}`);
  return hit[0];
}

function check(label, ok, detail = "") {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`FAIL ${label}${detail ? " — " + detail : ""}`);
    failures.push(label);
  }
}

/** 单引号转义，用于把值安全写进 bash 脚本（WSL interop 不会传递任意环境变量）。 */
function sq(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

/** 用 bash 跑一段驱动脚本，逐行打印 ok/FAIL，末尾以退出码汇总。 */
function bashDriver(label, script, vars = {}) {
  const prefix = Object.entries(vars)
    .map(([k, v]) => `${k}=${sq(v)}`)
    .join("\n");
  const r = spawnSync("bash", ["-s"], {
    input: prefix + "\n" + script,
    encoding: "utf8",
    cwd: WORK,
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = ((r.stdout || "") + (r.stderr || "")).replace(/\0/g, "").trim();
  for (const line of out.split("\n")) {
    if (line.startsWith("ok   ")) console.log(line);
    else if (line.startsWith("FAIL ")) {
      console.log(line);
      failures.push(`${label}: ${line.slice(5)}`);
    } else if (line.startsWith("ASSERT_FAIL") || line.startsWith("main:") || line.startsWith("/bin/bash:")) {
      console.log(`     ${line}`);
    }
  }
  if (r.status !== 0 && !out.includes("FAIL ")) {
    check(`${label}: 驱动脚本异常退出`, false, `exit=${r.status} ${out.slice(0, 160)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. agent loop：单一绝对 deadline 覆盖 decide / tool / complete     */
/* ------------------------------------------------------------------ */
function checkAgentLoop() {
  const ts = pickBlock("agent-tool-loop.md", "ts", "async function runAgent");
  let tsModule;
  try {
    tsModule = createRequire(import.meta.url)("typescript");
  } catch {
    console.log("SKIP agent loop（未找到 typescript，跳过）");
    return;
  }
  const js = tsModule.transpileModule(ts, {
    compilerOptions: { module: tsModule.ModuleKind.ESNext, target: tsModule.ScriptTarget.ES2022 },
  }).outputText;

  const driver = `
const hang = () => new Promise(() => {});
let toolEntered = false;
let seq = 0;
const ok = (n) => ({ ok: true, summary: "s" + n, fingerprint: "f" + n });

async function run(budgetMs, decide, tool, complete) {
  BUDGET.maxMs = budgetMs;
  const t0 = Date.now();
  const res = await runAgent("demo", decide, tool, complete);
  return { res, ms: Date.now() - t0 };
}
const fail = [];
const expect = (cond, msg) => { if (!cond) fail.push(msg); };

// A：决策阶段挂起
const A = await run(10, hang, async () => ok(1), async () => true);
expect(A.res.status === "stopped" && A.res.reason === "time_budget" && A.res.detail === "decide",
  "A 决策挂起未收尾: " + JSON.stringify(A.res));
expect(A.ms < 60, "A 决策阶段未在有限时间结束: " + A.ms + "ms");

// B：工具阶段挂起且忽略 signal
const B = await run(10, async () => ({ name: "t" + ++seq, args: {} }),
  async () => { toolEntered = true; return hang(); }, async () => true);
expect(B.res.detail === "tool", "B 工具挂起未收尾: " + JSON.stringify(B.res));
expect(B.ms < 60, "B 工具阶段未在有限时间结束: " + B.ms + "ms");
expect(toolEntered === true, "B 工具未被调用");

// C：完成判据挂起（等测试、等 CI）
const C = await run(10, async () => ({ name: "u" + ++seq, args: {} }), async () => ok(2), async () => hang());
expect(C.res.detail === "complete", "C 完成判据挂起未收尾: " + JSON.stringify(C.res));
expect(C.ms < 60, "C 完成阶段未在有限时间结束: " + C.ms + "ms");

// D：决策花掉 60ms，工具只剩 20ms；预算不得重置成又一个 80ms
const D = await run(80,
  async () => { await new Promise((r) => setTimeout(r, 60)); return { name: "v" + ++seq, args: {} }; },
  async () => hang(), async () => true);
expect(D.res.detail === "tool", "D 期望停在 tool 阶段: " + JSON.stringify(D.res));
expect(D.ms < 120, "D 预算被重置了（应约 80ms，实际 " + D.ms + "ms）");

// E：正常完成路径仍然可用
const E = await run(200, async () => ({ name: "w" + ++seq, args: {} }), async () => ok(3), async () => true);
expect(E.res.status === "done" && E.res.step === 1, "E 正常完成路径失效: " + JSON.stringify(E.res));

if (fail.length) { for (const m of fail) console.log("ASSERT_FAIL " + m); process.exit(1); }
console.log("loop-ok");
`;
  const file = path.join(WORK, "loop.mjs");
  writeFileSync(file, js + driver, "utf8");
  const r = spawnSync(process.execPath, [file], { encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  check("agent loop: decide/tool/complete 三处挂起都在 deadline 收尾，预算不重置", r.status === 0, out.split("\n").slice(0, 4).join(" | "));
}

/* ------------------------------------------------------------------ */
/* 2. hook：只拦高危命令；读命令放行；项目路径含空格仍可执行          */
/* ------------------------------------------------------------------ */
function checkHookFilter() {
  const script = pickBlock("automation-checkpoints.md", "bash", "高危命令过滤器");
  const settings = JSON.parse(pickBlock("automation-checkpoints.md", "json", "PreToolUse"));
  const rawCommand = settings.hooks.PreToolUse[0].hooks[0].command;

  const projectName = "project dir with space";
  const hookDir = path.join(WORK, projectName, ".claude", "hooks");
  mkdirSync(hookDir, { recursive: true });
  const hookPath = path.join(hookDir, "require-approval.sh");
  writeFileSync(hookPath, script, "utf8");
  chmodSync(hookPath, 0o755);

  // command 里只有 ${CLAUDE_PROJECT_DIR} 需要替换；引号原样保留，正是要验证的部分
  const command = rawCommand.replaceAll("${CLAUDE_PROJECT_DIR}", projectName);

  const driver = String.raw`
set -u
fail=0
say() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 — 期望 $3 实际 $2"; fail=1; fi }
fire() { printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1" | sh -c "$HOOK_CMD" >/dev/null 2>&1; echo $?; }
[ -x "$PROJECT/.claude/hooks/require-approval.sh" ] || { echo "FAIL 钩子脚本不可执行"; exit 1; }

say "hook: 「git status」放行"        "$(fire 'git status')" 0
say "hook: 「ls -la」放行"            "$(fire 'ls -la')" 0
say "hook: 「npm test」放行"          "$(fire 'npm test')" 0
say "hook: 「git log」放行"           "$(fire 'git log --oneline -5')" 0
say "hook: 「git push」未批准 exit 2" "$(fire 'git push origin main')" 2
say "hook: 「rm -rf」未批准 exit 2"   "$(fire 'rm -rf dist')" 2

out=$(printf '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | sh -c "$HOOK_CMD" 2>&1 >/dev/null)
case "$out" in *高危命令*) echo "ok   hook: 阻断原因写进 stderr";; *) echo "FAIL hook: stderr 无阻断原因 — $out"; fail=1;; esac

approved=$(printf '{"tool_name":"Bash","tool_input":{"command":"git push"}}' | HUMAN_APPROVED=1 sh -c "$HOOK_CMD" >/dev/null 2>&1; echo $?)
say "hook: 批准后放行" "$approved" 0

say "hook: 粗筛会误伤含关键词的提交信息（已知代价）" "$(fire 'git commit -m "note: git push later"')" 2
exit $fail
`;
  bashDriver("hook", driver, { HOOK_CMD: command, PROJECT: projectName });
}

/* ------------------------------------------------------------------ */
/* 3. review：NUL 分隔读未跟踪文件；空格/中文/换行/前导 - 都不出事     */
/* ------------------------------------------------------------------ */
function checkReviewDiff() {
  const script = pickBlock("claude-code-review.md", "bash", "git ls-files -z");
  writeFileSync(path.join(WORK, "collect.sh"), script, "utf8");

  const driver = String.raw`
set -u
fail=0
say() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 — 期望 $3 实际 $2"; fail=1; fi }
SNIPPET=$(pwd)/$SNIPPET
mkdir -p "$REPO" && cd "$REPO" || { echo "FAIL 无法建仓库"; exit 1; }
git init -q
git config user.email t@example.com
git config user.name t
git commit -q --allow-empty -m init

# 四个麻烦文件名：空格、中文、换行、前导短横线（换行名只能用 shell 建）
printf 'a' > plain.ts
printf 'b' > '有 空格.ts'
printf 'c' > '中文名.ts'
printf 'd' > $'line\nbreak.ts'
printf 'e' > ./-leading.ts

rm -f /tmp/review.diff
bash "$SNIPPET" >/dev/null 2>&1
code=$?
say "review: 收集脚本退出码 0" "$code" 0
say "review: 生成 /tmp/review.diff" "$([ -s /tmp/review.diff ] && echo yes || echo no)" yes

for n in 'plain.ts' '有 空格.ts' '中文名.ts' $'line\nbreak.ts' '-leading.ts'; do
  if grep -qF -- "--- $n" /tmp/review.diff; then echo "ok   review: diff 含文件名 $(printf '%q' "$n")";
  else echo "FAIL review: diff 缺文件 $(printf '%q' "$n")"; fail=1; fi
done
say "review: 五个未跟踪文件都进了 diff" "$(grep -c '^--- ' /tmp/review.diff)" 5

# 反例：旧的 for f in $(...) 写法按空白拆分，项数对不上 5
naive=$(for f in $(git ls-files --others --exclude-standard); do echo "$f"; done | wc -l)
if [ "$naive" = 5 ]; then echo "FAIL review: 旧写法竟然也对（预期按空白拆分会多算）"; fail=1
else echo "ok   review: 旧写法 \$(...) 拆出 $naive 项 ≠ 5（必须用 -z）"; fi

# 读取失败必须中止：把一个未跟踪文件换成悬空符号链接
rm -f plain.ts && ln -s no-such-target plain.ts
rm -f /tmp/review.diff
err=$(bash "$SNIPPET" 2>&1 >/dev/null); code=$?
if [ "$code" -ne 0 ]; then echo "ok   review: 读取失败时以非零退出（$code）"
else echo "FAIL review: 读取失败却退出 0"; fail=1; fi
case "$err" in *读取失败*) echo "ok   review: 报出失败的文件名";; *) echo "FAIL review: 没有报出失败文件 — $err"; fail=1;; esac
rm -f /tmp/review.diff
exit $fail
`;
  bashDriver("review", driver, { REPO: "repo", SNIPPET: "collect.sh" });
}

/* ------------------------------------------------------------------ */
/* 4. skill 校验脚本：name 与目录名不一致必须是失败而不是 WARN        */
/* ------------------------------------------------------------------ */
function checkSkillValidator() {
  const script = pickBlock("skills-validation.md", "bash", "check-skill.sh");
  const scriptPath = path.join(WORK, "check-skill.sh");
  writeFileSync(scriptPath, script, "utf8");

  const mk = (name, body) => {
    mkdirSync(path.join(WORK, "skills", name), { recursive: true });
    writeFileSync(path.join(WORK, "skills", name, "SKILL.md"), body, "utf8");
  };
  mk("good-skill", "---\nname: good-skill\ndescription: 生成发布说明时使用\n---\n# steps\n");
  mk("wrong-dir", "---\nname: good-skill\ndescription: 目录名与 name 不一致\n---\n");
  mk("bad-chars", "---\nname: My_Skill\ndescription:\n---\n");

  const driver = String.raw`
set -u
fail=0
say() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 — 期望 $3 实际 $2"; fail=1; fi }
run() { bash "$CHECKER" "$SKILLS/$1" >/tmp/skill.out 2>&1; echo $?; }

say "skill: 合法 skill 退出码 0"        "$(run good-skill)" 0
say "skill: name≠目录名 退出码非 0"     "$(run wrong-dir)" 1
if grep -q 'FAIL name' /tmp/skill.out; then echo "ok   skill: 不一致时输出 FAIL name"; else echo "FAIL skill: 不一致时未输出 FAIL name — $(cat /tmp/skill.out)"; fail=1; fi
say "skill: 非法 name/空描述 退出码非 0" "$(run bad-chars)" 1
if bash "$CHECKER" "$SKILLS/no-such-dir" >/dev/null 2>&1; then echo "FAIL skill: 目录不存在却退出 0"; fail=1
else echo "ok   skill: 目录不存在退出非 0"; fi
rm -f /tmp/skill.out
exit $fail
`;
  bashDriver("skill", driver, { CHECKER: "check-skill.sh", SKILLS: "skills" });
}

const started = Date.now();
console.log("== 抽取正文代码块并就地运行 ==");
try {
  checkAgentLoop();
  checkHookFilter();
  checkReviewDiff();
  checkSkillValidator();
} finally {
  // Windows API 删不掉换行文件名，交给 bash
  spawnSync("bash", ["-c", `rm -rf ${sq(path.basename(WORK))} /tmp/review.diff /tmp/skill.out`], { cwd: WORKROOT });
  rmSync(WORK, { recursive: true, force: true });
}

const verdict = failures.length === 0 ? "PASS" : `FAIL (${failures.length})`;
console.log(`\n== ${verdict} · ${((Date.now() - started) / 1000).toFixed(1)}s ==`);
process.exit(failures.length === 0 ? 0 : 1);
