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
