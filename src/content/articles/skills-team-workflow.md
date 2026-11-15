---
title: "团队 Skill 分发：版本固定、兼容矩阵与可回滚交接"
description: "把团队 Skill 纳入版本控制，审查改动范围、记录不可变 revision、维护兼容矩阵，并用 revert 安全回滚。"
category: "skills"
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: "进阶"
order: 350
tags: ["Agent Skills", "团队协作", "版本控制"]
featured: false
---

个人 Skill 可以靠记忆维护，团队 Skill 不行。队友需要知道用的是哪个版本、在哪些客户端验证过、出了问题怎么退回，而不是在聊天里传一个压缩包。本文用一个虚构但完整的 `release-check` 场景，说明如何把 Skill 放进 Git、审查改动、固定 revision、维护兼容矩阵，并在不破坏其他 Skill 的前提下回滚。格式和触发质量的检查交给 [Skill 验证](/articles/skills-validation/)，这里只谈分发和运维。

## 前置条件

- Skill 已经能在一个客户端中加载；如果还没有，先完成 [第一个 Agent Skill](/articles/skills-first-skill/)。
- 团队约定 Skill 放在仓库的 `.claude/skills/<name>/` 或另一个受版本控制的目录；路径一旦选定，写进交接文档。
- 有 Git 基础：能创建分支、查看 diff、revert 提交；不需要改写公共历史。
- 已有一个静态检查或人工检查流程；本文不重复设计校验规则。资源拆分与按需加载见 [Skill 资源拆分](/articles/skills-resources/)。

## 第 1 步：把 Skill 当成代码审查

每次修改 Skill 都开分支，提交信息写清范围和验证。审查时先看“改了哪些文件”，再看内容：

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
git diff main...HEAD -- .claude/skills/release-check
```


一个可合并的 Skill 改动通常只触及自己的目录：`SKILL.md`、`scripts/`、`references/`、`assets/`。如果 diff 里出现 `.env`、CI 配置、其他 Skill 或应用源码，先停下来确认是否同一个变更。脚本要额外审查：有没有网络请求、删除操作、读取密钥、把用户输入拼进 shell。Skill 是会被执行的代码，不是纯文档。

审查清单可以很短：

- `name` 与目录名一致，`description` 仍然能区分触发场景。
- 正文中的相对引用都存在，没有绝对家目录。
- 脚本可离线运行，错误时返回非零码和可读信息。
- 没有把 token、客户数据或内部 URL 写进示例。
- 变更范围与 PR 描述一致，没有“顺手重构”其他 Skill。

## 第 2 步：固定不可变 revision

`metadata.version: "1.2.0"` 对人类有意义，但客户端不保证读取或强制执行它；真正可复现的是 Git commit SHA。发布时同时记录两者：

```text
Skill: release-check
Version: 1.2.0
Revision: <commit-sha>
Tag: skills-release-check-v1.2.0
Path: .claude/skills/release-check
```

Tag 方便人读，但 tag 可以移动；交接和回滚以完整 SHA 为准。如果团队用子模块或包管理器分发，也要记录外层仓库的 SHA，否则“Skill 版本”仍然无法复现。不要把“最新 main”当作固定版本，它每天都会变。

## 第 3 步：维护兼容矩阵

同一个 Skill 在不同客户端、操作系统和 Node 版本上的表现可能不同。矩阵不必很大，但要覆盖真实使用面：

| 客户端 | 客户端版本 | Skill revision | 路径 | 自动触发 | 直接调用 | 脚本 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | 团队实测版本 | `<sha>` | `.claude/skills/release-check` | 通过/失败 | `/release-check` | `--self-test` | 项目级 |
| 其他支持 Agent Skills 的客户端 | 团队实测版本 | `<sha>` | 按客户端文档 | 通过/失败/N/A | 按客户端 | 按客户端 | 不假设路径 |

“N/A”不是失败：有的客户端只支持显式调用，不支持按描述自动触发；有的客户端不执行脚本。矩阵要记录**实际验证过的能力**，不要把规范里的“应该支持”写成“已经通过”。客户端版本不要填“最新”，那不可复现；填团队实际安装并测试过的版本。

## 第 4 步：交接信息要能独立行动

把下面这段放进 PR 描述、发布说明或团队手记。队友只读这一段，就应该知道怎么用、怎么验证、怎么退：

```text
Skill: release-check
Revision: <commit-sha>
Tag: skills-release-check-v1.2.0
Path: .claude/skills/release-check
Owner: <team or person>
Changed: 增加 lockfile 检查；脚本改为离线解析
Verified:
  - Claude Code <version>, macOS: /release-check 与自动触发
  - Node <version>: scripts/check.mjs --self-test
Known gaps:
  - Windows 未验证；路径分隔符可能不同
Rollback:
  - git revert <commit-sha>
  - 不需要删除其他 Skill 或整个 .claude/skills 目录
```

“Changed”写行为变化，不写“优化了一下”。“Verified”写命令和结果，不写“测试过了”。“Known gaps”不是丢脸，它防止队友把未验证平台当成已支持。

## 第 5 步：回滚而不是清空

发现新版本导致误触发或脚本失败时，首选 `git revert <sha>`。它创建一个反向提交，保留历史，不影响其他 Skill；如果问题提交同时改了多个文件，revert 会把它们一起撤回，所以提交时尽量让一个 Skill 的变更独立。

紧急情况下需要在工作区恢复旧文件，可以先提交或暂存本地改动，再在干净状态执行：

```bash
git restore --source=<old-sha> --staged --worktree -- .claude/skills/release-check
git diff --cached -- .claude/skills/release-check
git commit -m "restore release-check to <old-sha>"
```

`git restore` 会把该目录完整对齐到旧版本：旧版不存在的文件会被删除，而不是像 `git checkout <sha> -- <path>` 那样只覆盖同名文件、把后来新增的文件留在工作区。恢复前先确认路径下没有你尚未提交的修改。

不要用 `git reset --hard` 处理共享分支，也不要用 `rm -rf .claude/skills` 清空后重来；前者会丢本地改动，后者会删掉其他团队的 Skill。回滚后重新跑一次矩阵中的直接调用和脚本自测，确认恢复的是可用版本，而不只是文件回来了。

## 验收标准

- 每个发布都有完整 SHA、路径和负责人，tag 只作辅助。
- PR diff 的范围可解释；脚本经过人工安全审查。
- 兼容矩阵记录客户端版本、系统、直接调用、自动触发和脚本结果。
- 回滚使用 revert 或受控 checkout，不删除无关 Skill。
- 交接文档能让没参与开发的人独立复现验证步骤。

## 常见错误与诊断

- **队友说“Skill 没更新”**：先核对客户端加载的是项目级还是个人级路径，再核对 SHA；同名 Skill 在两处时，后加载的会覆盖预期。
- **按 tag 部署后内容不一致**：tag 被移动或重新指向；改用 commit SHA，tag 只用于展示。
- **回滚后其他 Skill 消失**：有人删除了整个 `.claude/skills` 或做了全目录 checkout；改为按 Skill 目录 revert/restore。
- **macOS 通过、Windows 失败**：脚本硬编码 `/`、换行或 shell 命令；用 Node 的 `path` API，并在矩阵中记录 Windows 结果。
- **自动触发在不同客户端表现不同**：这是客户端能力差异，不是规范保证；矩阵中如实写“自动触发 N/A”，不要为了统一而改坏描述。

## 参考来源

- Agent Skills Specification：https://agentskills.io/specification
- Claude Code Skills（项目级与个人级路径）：https://code.claude.com/docs/en/skills
- Git revert 文档：https://git-scm.com/docs/git-revert

官方资料核对日期：2026-11-14。文中的版本号、提交 SHA 和团队场景为示例占位，不代表任何真实项目或实测结论。