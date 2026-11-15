---
title: "用 GitHub Actions 给静态站点加检查与构建门禁"
description: "为 Astro 静态站点写一条最小 CI：只读权限、固定 Node、显式工作目录，依次跑 check、build 和 smoke test，并避开 PR 密钥风险。"
category: "automation"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 510
tags: ["GitHub Actions", "CI", "静态站点"]
featured: false
---

静态站点没有服务器要部署，但仍然需要门禁：Markdown frontmatter 写错、内部链接指向不存在的文章、构建时才暴露的导入错误，都应该在合并前失败，而不是等 Pages 发布后才发现。本文给这个 Astro 项目加一条最小 CI，只做三件事：类型/内容检查、生产构建、冒烟测试。它不需要任何密钥，也不会执行 PR 里的任意脚本去访问生产环境。

## 前置条件

- 仓库已有 `package.json` 和 `package-lock.json`，并定义了 `check`、`build`、`test:smoke` 三个脚本。
- 站点构建不需要外部 API 或私密环境变量；如果确实需要，先读 [CI 中的密钥边界](/articles/automation-secrets/)，不要直接把 secret 塞进这条工作流。
- 先读 [自动化流水线](/articles/automation-pipeline/) 和 [构建检查点](/articles/automation-checkpoints/)，了解这条 CI 在整体流程中的位置。
- 理解现有部署工作流。本项目的 `.github/workflows/deploy.yml` 已使用 `actions/checkout@v4`、`actions/setup-node@v4`、`actions/upload-pages-artifact@v3` 和 `actions/deploy-pages@v4`；本文沿用仓库已有的 action 版本，不声称它们是最新版。
- 不需要在本机安装 GitHub CLI；下面的 YAML 可以先用本地 YAML 解析器做语法检查。

## 工作流全文

文件放在 `.github/workflows/content-check.yml`：

```yaml
name: content-check

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: content-check-${{ github.ref }}
  cancel-in-progress: true

jobs:
  content:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - run: npm run test:smoke
```

这段 YAML 的每个字段都有作用：

- `on.pull_request` 在 PR 更新时运行；`push.branches: [main]` 保证合并后主干也验证一次。没有配置 `paths` 过滤，因为内容、配置和测试都可能影响构建，漏跑比多跑更贵。
- `permissions.contents: read` 是顶层最小权限。构建只需要读代码，不需要写 issue、PR 或 Pages；写权限留给单独的部署工作流。
- `concurrency` 按 ref 分组，新提交会取消同一 PR 的旧运行，避免排队浪费；`cancel-in-progress` 对 PR 安全，对发布分支要谨慎。
- `timeout-minutes: 15` 防止卡死的步骤占满额度；`defaults.run.working-directory: .` 明确所有 `run` 都在仓库根目录执行。
- `actions/checkout@v4` 的 `persist-credentials: false` 避免把 token 留在 `.git/config` 里，后续脚本即使被注入也拿不到推送凭据。
- `setup-node@v4` 指定 Node 22 和 npm 缓存；缓存键默认基于 lockfile，所以 `npm ci` 能复现依赖。
- 步骤顺序是 `npm ci` → `check` → `build` → `test:smoke`。冒烟测试依赖构建产物，必须放在 build 之后。

## 三个脚本各自负责什么

以本仓库为例：

| 命令 | 作用 | 典型失败 |
| --- | --- | --- |
| `npm run check` | Astro/TypeScript 与内容集合校验 | frontmatter 缺字段、类型错误 |
| `npm run build` | 生成静态页面 | 导入路径错误、MDX 编译失败 |
| `npm run test:smoke` | 对 `dist` 做路由/内容断言 | 页面缺失、标题或链接不符合预期 |

`test:smoke` 不是端到端浏览器测试。本仓库的 `test:e2e` 需要 `dist` 和系统 Chrome，不适合作为默认 CI 门禁；把它放在单独的工作流或本地验证，避免每次 PR 都安装浏览器。CI 的目标是“快速失败”，不是“把所有测试都塞进一条”。

## 权限与 PR 边界

这条工作流没有任何 `secrets` 引用，这是有意的：

- 来自 fork 的 `pull_request` 运行默认拿不到仓库 secret，`GITHUB_TOKEN` 也是只读；工作流不依赖 secret，所以 fork PR 仍能正常跑检查。
- 不要为了让 PR 能评论或部署而改成 `pull_request_target` 并检出 PR 代码。该事件在基仓上下文运行，token 权限更高；一旦执行不可信代码，等于把写权限交给 PR 作者。
- 如果未来要上传构建产物，给 `actions/upload-artifact` 单独最小权限，并确认产物不含 `.env`、token 或内部文档。
- 构建脚本本身也是代码。PR 可以修改 `package.json` 的 `build` 脚本，所以这条工作流只应在无密钥、只读 token 的环境中运行；不要在这里注入生产凭据。

## 路径与版本假设

`working-directory: .` 假设 `package.json` 在仓库根目录。如果站点在 `site/` 子目录，要同时改三处：

```yaml
defaults:
  run:
    working-directory: site
```

并在 `setup-node` 中设置 `cache-dependency-path: site/package-lock.json`；否则缓存找不到锁文件，`npm ci` 也会在错误目录执行。`checkout` 不需要改，它默认检出整个仓库。

Node 版本也要与本地一致。仓库的 `package.json` 若声明 `engines.node`，CI 的 `node-version` 应满足它；只在本地用 Node 24、CI 用 Node 22，可能遇到依赖或 API 差异。本文沿用仓库部署工作流的 Node 22，不表示所有项目都必须用 22。

## 本地验证与预期结果

在提交前可以先做 YAML 语法检查（需要 PyYAML）：

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/content-check.yml')); print('yaml ok')"
```

本地实际输出：

```text
yaml ok
```

注意 PyYAML 按 YAML 1.1 解析时会把未加引号的 `on` 当作布尔键；这不影响 GitHub 解析，但用脚本读取键名时要小心。更可靠的做法是用 GitHub 的 workflow schema 或 `actionlint` 检查，本文未安装这些工具。

工作流推送到 GitHub 后，预期在 Actions 页面看到 `content-check` 运行，六个步骤依次通过。如果 `tests/smoke.mjs` 固定了文章 id 或页面数量，新增/删除文章后要先同步测试，否则 `test:smoke` 会在数量断言处失败。**本文没有在 GitHub 上实际触发该工作流**，因为当前任务不允许推送；本地只验证了 YAML 可解析和三个 npm 脚本存在，未运行完整构建。

## 常见错误与诊断

- **`npm ci` 报 `The `npm ci` command can only install with an existing package-lock.json`**：锁文件没提交或被 `.gitignore` 忽略；提交 `package-lock.json`，不要改成 `npm install` 掩盖问题。
- **`npm ci` 报 lockfile 与 `package.json` 不同步**：本地更新依赖后没有重新生成锁文件；在本地运行 `npm install` 并提交锁文件，CI 仍用 `npm ci`。
- **`npm run check` 在本地通过、CI 失败**：Node 版本或依赖安装方式不同；对齐 `node-version`，确认 CI 用的是 `npm ci` 而不是本地残留的 `node_modules`。
- **`test:smoke` 找不到 `dist`**：步骤顺序错了，或 `build` 输出目录不是测试期望的路径；把 smoke 放在 build 之后，并检查脚本里的目录常量。
- **`working-directory` 设置后仍找不到 `package.json`**：路径相对仓库根目录，不是相对上一步；确认子目录名和 `cache-dependency-path` 一致。
- **PR 来自 fork 时密钥为空**：这是 GitHub 的安全边界，不是配置错误；需要密钥的步骤应放到受信任的分支/环境，或改为人工触发。

## 验收标准

- PR 和 main 推送都会触发同一条检查工作流。
- 工作流只有 `contents: read`，没有 secret，没有写操作。
- `check`、`build`、`test:smoke` 顺序正确，任一失败都会让检查失败。
- Node 版本、工作目录、锁文件路径与仓库实际结构一致。
- 文档明确说明哪些测试没有放进 CI，以及为什么。

## 参考来源

- GitHub Docs, *Workflow syntax for GitHub Actions*：https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Docs, *Use secrets in workflows*：https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- GitHub Docs, *Secure use reference*：https://docs.github.com/en/actions/reference/security/secure-use

官方资料核对日期：2026-11-14。工作流仅在本地做 YAML 解析，未在 GitHub 上运行；action 版本沿用仓库现有部署工作流。