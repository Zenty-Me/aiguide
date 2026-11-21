---
title: "GitHub Actions 密钥边界：注入、脱敏与产物卫生"
description: "说清仓库/环境/组织密钥的作用域、fork PR 权限、env 注入与脱敏的局限，并用只输出布尔结果的步骤验证配置。"
category: "automation"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 530
tags: ["GitHub Actions", "密钥管理", "供应链安全"]
featured: false
faq:
  - q: "环境密钥比仓库密钥更安全吗？"
    a: "不是简单的高低之分，它的价值在门禁：只有声明了该 environment 的 job 才能读取，环境还能要求人工批准、限制可部署分支。仓库密钥只要工作流能引用就能读，有写权限的人可以改工作流把它取走。"
  - q: "fork PR 为什么读不到密钥？"
    a: "这是预期边界，不是配置错误。来自 fork 的 pull_request 默认不获得仓库密钥，令牌也是只读。需要密钥的步骤应放到受信任的分支，或改用绑定 environment 的部署工作流。"
  - q: "脱敏为什么可能遮不住密钥？"
    a: "脱敏只匹配原样出现的完整值。值被 base64、URL 编码、拆分或拼接后就不再匹配；把整个 JSON 存成一个 secret 再打印其中某个字段，整体对不上，字段就暴露了。派生值可先用 add-mask 登记，但仍应避免输出。"
---

CI 里的密钥问题通常不是“有没有配”，而是“配到了谁能看到、谁能在日志里看到、谁能在产物里拿到”。GitHub Actions 的脱敏是尽力而为，不是保险箱：值被转换、拆分、编码或写进文件后，可能不再匹配。本文用一条只读验证工作流，说明密钥作用域、环境注入、fork PR 边界、脱敏限制和产物卫生；所有验证只输出布尔结果，不打印值。

## 前置条件

- 已有一条最小 CI，建议先读 [静态站点 CI 门禁](/articles/automation-ci-checks/) 和 [自动化流水线](/articles/automation-pipeline/)；重复事件的处理见 [自动化幂等](/articles/automation-idempotency/)。
- 知道密钥应该由 GitHub 的 Secrets 管理，而不是写进仓库、`.env` 或工作流 YAML。
- 有仓库管理员权限才能创建 environment、配置 required reviewers；普通贡献者只能使用已被授权的作用域。
- 本文不执行任何创建、读取或删除密钥的命令；验证需在受控仓库手动运行。

## 作用域：谁能用

| 作用域 | 谁可以引用 | 典型用途 | 边界 |
| --- | --- | --- | --- |
| Repository secret | 该仓库的 Actions 工作流 | 测试用只读 token | 有写权限的人可改工作流并读取 |
| Environment secret | 绑定了该 environment 的 job | 生产部署、发布 | 可配 required reviewers、分支限制 |
| Organization secret | 按访问策略选中的仓库 | 多个仓库共享 | 策略决定哪些仓库可用 |

环境密钥不是“更安全的仓库密钥”，它的价值在于**门禁**：job 声明 `environment: production`，环境可以要求人工批准、限制可部署分支，只有声明了该 environment 的 job 才能读取。组织密钥则受仓库访问策略约束，不要把生产密钥放到组织级让实验仓库也能读。

## 注入：用 env，不要拼命令行

最小验证工作流：

```yaml
name: secret-check

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Check presence without printing the value
        env:
          API_TOKEN: ${{ secrets.API_TOKEN }}
        run: |
          set -eu
          if [ -z "${API_TOKEN}" ]; then
            echo "API_TOKEN is missing for this job"
            exit 1
          fi
          echo "API_TOKEN is available to this step"
```

要点：

- 密钥通过 `env` 注入，不写成 `run: curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}"`。后者会在命令展开、进程参数和错误信息中留下痕迹。
- `environment: production` 让环境门禁生效；如果环境配置了 required reviewers，job 会等待批准。
- 只输出“是否为空”，不输出长度、前缀、哈希或字符数。长度和前缀也是信息。
- `set -eu` 让未定义变量和失败命令立即退出；不要加 `set -x`，它会把展开后的命令打印出来。

如果要验证密钥能否通过 API 认证，让请求只输出状态码，不输出响应体：

```bash
status=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${API_TOKEN}" \
  https://api.example.com/v1/whoami)
test "$status" = "200"
echo "authenticated request succeeded"
```

日志只有布尔结果。

## 脱敏：只对“原样出现”的值有效

GitHub 的日志脱敏由 runner 执行。官方文档明确：GitHub 会尽量遮蔽日志中的密钥，但**不保证**所有情况都能遮住；只有工作流可访问的密钥才会被遮蔽，且值必须被识别为密钥。以下情况容易漏：

- 值被 base64、URL 编码、拆分、拼接或改写后，不再与注册的密钥完全匹配。
- 把一个 JSON/YAML 文档整体存成一个 secret，只打印其中某个字段时，整体字符串不匹配，字段就暴露了。
- 通过文件、缓存、artifact、第三方 action 或错误消息带出，脱敏不一定覆盖。
- 官方对大体积密钥的 workaround 明确说明可能不参与脱敏；不要用“存成文件”绕过限制。

因此：

1. 能不用密钥就不用；能用短期、最小权限 token 就不用长期密钥。
2. 一个 secret 只放一个值，不要把整个配置对象塞进去。
3. 需要派生值时，先 `echo "::add-mask::${DERIVED}"` 再使用；但不要把 mask 当成万能，仍要避免打印。
4. 不要依赖“日志里看不到”来保护密钥；假设有仓库读权限的人最终能看到日志和产物。

`::add-mask::` 的写法是：

```bash
derived="prefix-${API_TOKEN}"
echo "::add-mask::${derived}"
```

mask 也会在本地 shell 历史和调试输出里留下痕迹，只在受控的 CI 步骤中使用。

## fork PR 与权限边界

- 来自 fork 的 `pull_request` 运行默认**不获得仓库密钥**，`GITHUB_TOKEN` 也是只读。这是设计，不是故障。
- 不要为了“让 fork PR 也能拿到密钥”改成 `pull_request_target` 并检出 PR 代码。该事件在基仓上下文运行，token 权限更高；执行不可信代码等于把写权限交给 PR 作者。
- 可复用工作流不会自动继承调用方的密钥。显式传递要写成映射：`secrets: { API_TOKEN: "${{ secrets.API_TOKEN }}" }`，并在 `on.workflow_call.secrets` 里声明同名输入。也可以写 `secrets: inherit`，但它会把调用方全部密钥交给被调用工作流，权限更大，优先显式传递。
- 密钥不能直接写在 `if:` 条件里；先映射到 `env`，再判断 `env.API_TOKEN != ''`。否则表达式上下文不支持，或得到空值。

PR 检查和主分支部署应拆成两条工作流：PR 无密钥、只读；部署绑定 environment。不要用一条工作流兼容两种信任级别。

## 产物与缓存卫生

构建产物、测试报告、覆盖率、缓存目录都可能携带密钥：

- 上传 artifact 时只列明确路径，不要 `path: .`。`.gitignore` 不会阻止 artifact 上传。
- 上传前检查目录里是否有 `.env`、`*.pem`、`credentials*`、日志文件；在 CI 里用 `find` 列出文件名可以，但不要 `cat` 内容。
- 缓存键不要包含密钥；缓存内容不要包含 `~/.npmrc`、`.netrc`、云凭据目录。
- 第三方 action 能读取 job 的 env 和 workspace；固定到 commit SHA 比浮动 tag 更可控，且只授予必要的 `permissions`。
- artifact 的可见性跟随仓库读权限；公开仓库要把它当作公开内容，敏感文件不要上传。

## 如何验证而不打印值

按“存在性 → 可用性 → 权限”三层验证，每层只输出布尔或状态码：

1. **存在性**：`[ -n "${API_TOKEN}" ]`，输出 `available`/`missing`。
2. **可用性**：调用一个只读、无副作用的端点，只输出 HTTP 状态码；不要输出响应体。
3. **权限**：用一个故意越权的请求确认被拒绝（例如读取不属于自己的资源返回 403），仍只输出状态码。

GitHub UI 和 `gh secret list` 只显示名称/更新时间，不显示值；它们能确认作用域，不能验证值。需要比对时在受控步骤内做布尔比较。

如果怀疑泄漏：先在提供商侧吊销/轮换密钥，再更新 GitHub secret，最后检查 Actions 日志、artifact、缓存和审计日志。顺序不能反：只删 GitHub secret 而不吊销，旧值仍然有效。

## 常见错误与诊断

- **fork PR 中密钥为空**：这是预期边界；不要改用 `pull_request_target` 检出不可信代码。
- **`if: secrets.TOKEN != ''` 不生效**：密钥不能直接在 `if` 中引用；映射到 job/step 的 `env` 后判断。
- **日志里出现 `***` 但旁边仍有片段**：值被拼接或编码，脱敏只匹配完整原值；停止打印派生值，改为布尔检查。
- **artifact 里发现 `.env`**：上传路径过宽；改为明确文件/目录，并在上传前做文件名检查。
- **`set -x` 打开后命令全部回显**：调试完立即移除；需要排查时用不含密钥的参数和脱敏后的变量名。
- **轮换后旧 token 仍可用**：只更新了 GitHub secret，没有在提供商侧吊销；先吊销再更新。

## 验收标准

- 每个密钥有明确作用域，生产密钥绑定 environment 并有审批/分支限制。
- 工作流通过 `env` 注入，日志不打印值、长度、前缀或响应体。
- fork PR 工作流不依赖密钥，且没有使用 `pull_request_target` 执行不可信代码。
- artifact 和缓存只包含明确路径，不含凭据文件。
- 有泄漏时的轮换与审计步骤，明确“删除 secret 不等于吊销”。

## 参考来源

- GitHub Docs, *Use secrets in workflows*：https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- GitHub Docs, *Secure use reference*：https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Docs, *Workflow syntax: permissions*：https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions

官方资料核对日期：2026-11-14。本文未创建、读取或删除任何真实密钥；示例中的 `api.example.com` 为占位地址，未实际请求。