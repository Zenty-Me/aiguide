# 系统专题内容扩充记录（2026-11-14）

## 范围与结论

本次新增 12 篇系统教程，覆盖 MCP 概念与工具设计、Skills 资源与团队协作、Agent 选型/契约/追踪、Automation CI/密钥/幂等。文章均为原创中文，正文不含 H1；外部资料只作为事实依据，未复制竞品正文或代码。

同时新增四组可离线运行的 Node.js 示例和一份 CI 工作流。示例不调用模型、不访问网络、不读写真实密钥；`tool-contracts`、`tracing`、`idempotency` 与 `skills/change-summary` 脚本均已实际执行，CI 工作流只做了 YAML 解析，未在 GitHub 上运行。

## 新增文章

| 文章 | 分类 | order | 难度 | 正文 CJK（不含代码） | 内容 |
| --- | --- | ---: | --- | ---: | --- |
| `src/content/articles/mcp-concepts.md` | mcp | 210 | 入门 | 1555 | host/client/server、三层原语、一次完整请求、stdio 与远程、排障责任 |
| `src/content/articles/mcp-tool-design.md` | mcp | 240 | 进阶 | 1390 | 窄接口、输入/输出 schema、校验与授权分离、业务失败语义、`count_words` |
| `src/content/articles/mcp-debugging.md` | mcp | 250 | 进阶 | 1535 | 启动/initialize/tools-list/tools-call 分层、Inspector CLI、stdout 污染、cwd/env |
| `src/content/articles/skills-first-skill.md` | skills | 310 | 入门 | 1226 | 第一个可移植 `SKILL.md`、Claude Code 项目级发现路径、手工验收 |
| `src/content/articles/skills-resources.md` | skills | 330 | 进阶 | 1355 | `references/scripts/assets`、渐进加载、完整离线 diff 汇总脚本、路径与 cwd |
| `src/content/articles/skills-team-workflow.md` | skills | 350 | 进阶 | 1412 | 版本控制、diff 范围审查、revision 记录、兼容矩阵、回滚与交接 |
| `src/content/articles/agent-vs-workflow.md` | agent | 410 | 进阶 | 1784 | 固定工作流与模型驱动循环的选型、发布说明分诊、有界分支 |
| `src/content/articles/agent-tool-contracts.md` | agent | 420 | 进阶 | 1617 | 输入/输出校验、独立授权、结构化业务错误、完整 JS 示例 |
| `src/content/articles/agent-tracing.md` | agent | 440 | 进阶 | 1587 | trace/run/step、耗时与结果、落盘前脱敏、重试关联、完整 logger |
| `src/content/articles/automation-ci-checks.md` | automation | 510 | 进阶 | 1475 | GitHub Actions 检查/构建门禁、最小权限、路径与工作目录 |
| `src/content/articles/automation-secrets.md` | automation | 530 | 进阶 | 1799 | 密钥作用域、env 注入、fork PR 边界、脱敏限制、产物卫生 |
| `src/content/articles/automation-idempotency.md` | automation | 540 | 进阶 | 1587 | 重复事件、稳定幂等键、状态机、瞬时重试与永久失败、内存 demo |

全部文章均满足：`publishedAt`/`updatedAt` 为 `2026-11-14`、`featured: false`、3 条站内链接、代码围栏成对、无正文 H1。站内链接指向现有的 12 篇旧文或本次新增文章，未指向未创建页面。

## 可执行示例

目录：`.work/content-systems-examples/`

| 路径 | 用途 | 本地命令 | 实际结果 |
| --- | --- | --- | --- |
| `tool-contracts/read-ticket.mjs` | 工具输入/输出校验、授权独立、业务错误 | `node .work/content-systems-examples/tool-contracts/read-ticket.mjs` | `tool-contracts: 9 assertions passed` |
| `tracing/trace-logger.mjs` | trace/run/step、脱敏、重试关联、环形缓冲、JSONL 落盘 | `node .work/content-systems-examples/tracing/trace-logger.mjs` | `agent-tracing: 10 assertions passed` |
| `idempotency/idempotency.mjs` | 幂等键预留、in-progress/succeeded/failed、有限重试 | `node .work/content-systems-examples/idempotency/idempotency.mjs` | `automation-idempotency: 12 assertions passed` |
| `skills/change-summary/` | 可移植 Skill：完整 `SKILL.md`、脚本、参考清单、输出模板 | `node .work/content-systems-examples/skills/change-summary/scripts/collect-change-facts.mjs --self-test` | `self-test ok (14 assertions)` |
| `ci/content-check.yml` | 静态站点检查/构建/Smoke 门禁 | 本地仅做 YAML 解析 | 解析成功，6 个 step；未在 GitHub 执行 |

`skills/change-summary` 的脚本还实际验证了示例 diff、非 diff 输入、缺失文件与未知参数，输出见下一节。`SKILL.md` 另做静态检查：`name: change-summary` 与目录名一致，`description` 194 字符，正文 33 行；`references/`、`scripts/`、`assets/` 下的引用路径均存在。文章 `skills-resources.md` 中嵌入的脚本与示例文件逐字一致（去掉尾部换行比较），读者可按文章目录创建后运行。

## 来源与证据

标记 ★ 的资料已下载到 `.work/content-research/`，本次逐段检索；标记 — 的是文章引用的官方稳定页面，本次未重新抓取。所有条目核对/引用日期均为 2026-11-14。

| 主题 | 本地证据 | 最终 URL | 用途 |
| --- | --- | --- | --- |
| MCP 架构（2026-07-28 版） | ★ `mcp-architecture.txt` | https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture | host/client/server、原语、传输、无状态发现与请求流程 |
| MCP Inspector | ★ `mcp-inspector.txt` | https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector | Web/CLI/TUI 模式、连接与工具调用 |
| MCP Inspector CLI | ★ 同上 | https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli | 参数、退出码、严格 schema 检查 |
| Agent Skills 规范 | ★ `skills-specification.txt` | https://agentskills.io/specification | 目录、frontmatter、渐进加载、资源约束 |
| Agent Skills 概览 | ★ `skills-overview.txt` | https://agentskills.io/home | Skill 的定位与加载模型 |
| Claude Code Skills | — | https://code.claude.com/docs/en/skills | 项目/个人发现路径、`/skill-name`、支持文件 |
| Anthropic, Building effective agents | ★ `agent-effective.txt` | https://www.anthropic.com/research/building-effective-agents | workflow 与 agent 的定义及选型 |
| JSON Schema, Getting Started | ★ `json-schema.txt` | https://json-schema.org/learn/getting-started-step-by-step | 类型、属性、必填与校验边界 |
| GitHub Actions 工作流语法 | ★ `github-workflows.txt` | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax | `on`、`permissions`、`working-directory`、job/step |
| GitHub Actions secrets | ★ `github-secrets.txt` | https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets | 作用域、fork PR、`add-mask`、reusable workflow |
| GitHub Actions 安全使用 | ★ `github-secure.txt` | https://docs.github.com/en/actions/reference/security/secure-use | 脱敏限制、token 权限、`pull_request_target`、SHA 固定 |
| OWASP Authorization Cheat Sheet | — | https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html | 授权与输入校验分离 |
| OpenTelemetry, Traces | — | https://opentelemetry.io/docs/concepts/signals/traces/ | trace/span 术语与上下文 |
| W3C Trace Context | — | https://www.w3.org/TR/trace-context/ | 跨服务关联的公开规范 |
| Git revert | — | https://git-scm.com/docs/git-revert | 团队 Skill 回滚 |
| AWS Builders Library, idempotent APIs | — | https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/ | 幂等键与重试语义 |
| Stripe, Idempotent requests | — | https://docs.stripe.com/api/idempotent_requests | 幂等键复用与结果回放 |
| GitHub, webhook best practices | — | https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks | 重复投递、快速响应、异步处理 |

## 本地验证记录

运行环境：WSL 下的 `D:/code/aiguide`，Node v24.11.0，Python 3.12.3。WSL 启动时会先打印一条 localhost/NAT 提示，不属于脚本输出，下文已省略。

### 示例脚本

```bash
node .work/content-systems-examples/tool-contracts/read-ticket.mjs
node .work/content-systems-examples/tracing/trace-logger.mjs
node .work/content-systems-examples/idempotency/idempotency.mjs
node .work/content-systems-examples/skills/change-summary/scripts/collect-change-facts.mjs --self-test
```

实际输出：

```text
tool-contracts: 9 assertions passed
agent-tracing: 10 assertions passed
automation-idempotency: 12 assertions passed
self-test ok (14 assertions)
```

四个脚本另用 `node --check` 检查语法，全部通过。

### change-summary 的输入边界

示例 diff 实际输出（节选，保留了全部 flags）：

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

非 diff 输入：

```text
$ printf 'not a diff\n' | node .../collect-change-facts.mjs --stdin
{"ok":false,"error":{"code":"INVALID_DIFF","message":"expected the default output of git diff"}}
exit 2
```

缺失文件：

```text
$ node .../collect-change-facts.mjs --diff /tmp/does-not-exist.diff
{"ok":false,"error":{"code":"ENOENT","message":"ENOENT: no such file or directory, open 'D:\\tmp\\does-not-exist.diff'"}}
exit 2
```

未知参数：

```text
$ node .../collect-change-facts.mjs --unknown
{"ok":false,"error":{"code":"USAGE","message":"unknown argument: --unknown"}}
exit 2
```

### CI 工作流

```python
import yaml
data = yaml.safe_load(open('.work/content-systems-examples/ci/content-check.yml'))
```

PyYAML 解析成功，结构为 `['name', True, 'permissions', 'concurrency', 'jobs']`，共 6 个 step；PyYAML 按 YAML 1.1 把未加引号的 `on` 解析为布尔键 `True`，这是解析器行为，不是工作流错误。`on` 的值包含 `pull_request` 与 `push: branches: [main]`。未推送到 GitHub，未验证 runner 上的实际执行。

### 文章静态检查

用 Python 的 `yaml.safe_load` 读取每篇 frontmatter，并检查：

- 12 个 id 的 `category`/`order`/`difficulty` 与任务表一致；
- `publishedAt`、`updatedAt` 均为 `2026-11-14`，`featured` 为 `false`；
- 标题、描述、tags 非空；
- 正文 H1 为 0，代码围栏成对；
- 每篇恰好 3 条 `/articles/<id>/` 链接，目标均存在于现有 12 篇或新增 12 篇；
- 正文 CJK 在 900–1800 范围内（`automation-secrets` 为 1799）。

结果：`ALL 12 OK`。

## 未执行与限制

1. **未跑全站构建/测试**：`npm run check`、`npm run build`、`npm run test:smoke` 未执行。其他 worker 仍在改文章和工具页，主 Agent 负责集成后的统一验证；本次只做文章级静态检查和示例运行。
2. **Smoke 测试未运行**：当前 `tests/smoke.mjs` 动态读取 `src/content/articles`，并检查 `ARTICLE_IDS.length >= 36`；本次新增后源文章共 36 篇，满足下限。但构建和 smoke 本次未执行，主 Agent 仍需在集成后跑整套。
3. **CI 未在 GitHub 运行**：`content-check.yml` 只通过 YAML 解析；`checkout@v4`、`setup-node@v4` 等版本沿用仓库现有 `.github/workflows/deploy.yml`，未引入未经来源确认的新版本。
4. **MCP Inspector 未安装/未执行**：`mcp-debugging.md` 的命令按官方 CLI 文档整理，输出均标注为示意；本机没有可用的 `build/index.js` server，也没有调用真实 MCP server。
5. **Skill 未做客户端激活测试**：没有调用模型，也没有在 Claude Code 中验证自动触发；只验证了 Skill 文件和脚本本身。由于文件所有权限制，示例放在 `.work/content-systems-examples/skills/change-summary`，未写入 `.claude/skills`；文章命令按安装后的 `.claude/skills/change-summary` 路径书写，并在正文说明本地运行使用示例目录中的同一脚本。
6. **Agent 示例的边界**：`agent-vs-workflow.md` 中的 TypeScript 路由与循环是结构示例，未编译成应用；`agent-tool-contracts`、`agent-tracing`、`automation-idempotency` 是完整可运行的单文件 Node 示例，但前者不是真实模型集成，后两者也不代表生产级持久化或分布式追踪。
7. **幂等与追踪的演示性质**：幂等存储是进程内 `Map`，不跨进程/重启持久化，不承诺 exactly-once；tracing 是教学用 logger，不是 OpenTelemetry SDK，持久化采用 JSONL 文件且每次 `flush` 覆盖，未实现追加、采样、导出和并发写入治理。
8. **来源覆盖**：表中标 ★ 的资料有本地下载文本；标 — 的页面只用于文章引用，本次没有重新抓取。文章未声明具体产品价格、版本号或真实项目测量结果；MCP 的 2026-07-28 文档与旧版 `initialize` 生命周期的差异已在概念文中说明。
9. **未执行 Git/部署/密钥/模型操作**：没有 `git init`、提交、推送、部署，没有创建或读取 secret，没有 API/model 调用，也没有安装依赖。

## 集成交接

- 新增文章 id：`mcp-concepts`、`mcp-tool-design`、`mcp-debugging`、`skills-first-skill`、`skills-resources`、`skills-team-workflow`、`agent-vs-workflow`、`agent-tool-contracts`、`agent-tracing`、`automation-ci-checks`、`automation-secrets`、`automation-idempotency`。
- 文章已按 `src/content.config.ts` 的 schema 写入，`src/content/articles/` 下可直接被 Astro 内容集合读取。
- 当前 `tests/smoke.mjs` 动态读取文章目录并要求至少 36 篇；本次新增后共 36 篇。主 Agent 集成时统一跑 `npm run check`、`npm run build`、`npm run test:smoke`，不要手工硬编码文章 id；若其他 worker 继续增文，再确认下限与页面断言。
- 示例位于 `.work/content-systems-examples/`，不属于站点产物；是否保留由主 Agent 决定。