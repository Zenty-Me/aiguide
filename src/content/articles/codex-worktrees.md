---
title: "用 Git worktree 隔离两个 Codex 任务"
description: "从同一个已提交基线创建两个工作树，让 Codex 在独立分支上改代码；合并前验证、移除前保留改动，并看清工作树共享仓库历史而不是安全沙箱。"
category: codex
publishedAt: 2026-11-14
updatedAt: 2026-11-14
difficulty: 进阶
order: 80
tags: ["Codex", "Git", "worktree", "并行开发", "分支"]
featured: false
---

## 目标：让两个改动各自有目录和分支

同时让 Codex 处理两个独立需求时，最省事的做法往往是最危险的：在同一个目录里开两个会话，或者把仓库复制两份。前者会互相覆盖未提交改动，后者会让两份历史慢慢分叉。Git worktree 提供了第三种选择：同一个仓库对象库，多个检出目录，每个目录可以有自己的分支。

本文用两个工作树完成一次小改动合并。重点不是背命令，而是守住两个检查点：开始前有已提交的基线，移除前有已保存的改动。工作树不是安全边界，后文会单独说明。

## 前置条件

- Git 2.5 以上；本文实际使用 2.43.0。
- 已安装 Codex CLI，并能在一个普通仓库里完成只读任务。
- 一个至少有一次提交的仓库。未提交的改动先处理掉，不要带着它们创建工作树。
- 两个不冲突的任务，例如“给功能加一行”和“补一条文档”。如果两个任务必须改同一个文件，不要并行。

## 第一步：确认基线，再创建工作树

在主工作区执行：

```bash
cd ~/code/demo-repo
git status --short
git log --oneline -1
```

预期：`git status` 无输出，`git log` 显示一个明确的基线提交。若不是，先提交或 stash；本文不把“未提交状态”当作可靠起点。

创建带新分支的工作树：

```bash
git worktree add -b feature/worktree-demo ../demo-feature
git worktree list
```

预期结果（示意）：`git worktree list` 显示两行，一行是原目录的 `master`，一行是新目录的 `feature/worktree-demo`。新目录与主目录共享 `.git` 对象库，但不是同一个工作区；在其中一个目录修改文件，不会自动出现在另一个目录。

## 第二步：让 Codex 在各自目录工作

分别进入两个目录启动会话。第一个工作树处理功能：

```bash
cd ../demo-feature
codex --sandbox workspace-write --ask-for-approval on-request
```

提示词：

```text
只修改 app.txt，在末尾追加一行 "line two from feature"。
不要改其他文件，完成后展示 git diff。
```

预期（示意）：功能工作树里 `app.txt` 多一行，主工作树的工作区文件不变。

这里有两个容易误判的点：`demo-feature` 是目录名，分支名是 `feature/worktree-demo`；此时改动还没提交，主工作树既看不到内容，也没有可比较的提交区间。想让另一个工作树里的 Codex 审阅，先提交，再按下一步用区间 diff 提供输入。启动 Codex 前用 `pwd` 或 `git rev-parse --show-toplevel` 确认目录，不要把“我以为在这里”当成事实。

## 第三步：先提交，再合并

在功能工作树中验证并提交：

```bash
cd ../demo-feature
git diff
git status --short
git add app.txt
git commit -m "feature: add second line"
```

提交后，主工作树才有可审阅的区间。回到原主工作树（原目录），用 `HEAD...feature/worktree-demo` 检查这个分支的全部改动：

```bash
cd ../demo-repo
git --no-pager diff HEAD...feature/worktree-demo
codex --ask-for-approval never exec --sandbox read-only \
  "运行 git diff HEAD...feature/worktree-demo，指出 app.txt 新增了什么、是否只改了这一个文件。"
```

这里的 `HEAD` 指原主工作树的当前分支（叫 `main` 还是 `master` 都行），跑命令前该工作树要保持干净：三点 diff 只比较提交，未提交改动不会进结果。用三点写法 `HEAD...feature/worktree-demo` 比较的是两条分支的分叉点，不会把原主工作树分支上后来别人的提交算进来。未提交的改动只存在于功能工作树自己的 `git diff` 里，主工作树和这条命令都看不到。

然后在主工作树合并：

```bash
cd ../demo-repo
git merge --no-ff feature/worktree-demo
git log --oneline --graph -5
```

预期（示意）：主工作树出现一个合并提交，`app.txt` 包含两行。若发生冲突，先在工作树里解决并提交，不要用 `git reset --hard` 丢弃另一边；冲突本身说明两个任务并不独立，应该重新划分范围。

## 第四步：移除前确认改动已经保存

工作树里的未提交修改不会被主工作树自动接管。移除前先检查：

```bash
cd ../demo-feature
git status --short
```

应当无输出。若有输出，先提交到分支，或把需要的内容复制到安全位置；不要直接加 `--force`。确认后移除：

```bash
cd ../demo-repo
git worktree remove ../demo-feature
git branch -d feature/worktree-demo
git worktree list
```

预期：列表只剩主工作树；`git branch -d` 只删除已经合并的分支，未合并时会拒绝。这个拒绝是保护，不是障碍。

本文的离线 fixture 实际记录了三个结果：在同一分支上再建工作树会以 128 退出，并提示该分支已被某个工作树使用；未提交修改的工作树在移除时会以 128 退出，并提示使用 `--force`；提交、合并、移除并删除分支后，`app.txt` 保留两行，功能分支的提交仍在合并历史里，工作区干净。这些输出来自本地临时仓库，不是对任意仓库的承诺。

## 第五步：理解共享边界

工作树共享对象数据库、引用和仓库历史。它们不是复制出来的独立仓库，也不是安全隔离：同一个用户下的进程可以读写这些目录，凭据和环境变量也不会因为换了目录而隔离。不要用工作树运行不可信代码，也不要把“分开的目录”当成“分开的权限”。

它真正解决的是并发编辑和分支切换成本：一个目录停在 `master`，另一个目录停在功能分支，不需要反复 `git switch` 和 stash。若任务需要完全独立的依赖目录或构建缓存，工作树共享的只是 Git 元数据，构建产物仍要按目录分别管理。

## 常见失败与诊断

**1. 同一分支不能在两个工作树同时检出。** 实际错误形如 `fatal: 'feature/worktree-demo' is already used by worktree at '...'`，退出码 128。给第二个任务建新分支；只读检查可以用 detached HEAD，但不要在两个目录提交同一分支。

**2. 移除时提示包含修改或未跟踪文件。** 这是防止丢数据的正常行为。先 `git status`、`git diff`，提交或复制需要的内容，再移除。不要用 `--force` 跳过检查，也不要用 `git clean -fd` 清空未知文件。

**3. 目录已存在或不是空目录。** `git worktree add` 不会覆盖已有内容。换一个空路径，或先确认旧目录是否已经注册在 `git worktree list` 中；手动删除目录后，管理信息可能仍在，按需执行 `git worktree prune`，不要删除整个 `.git/worktrees`。

**4. 删除分支被拒绝。** 通常是没有合并。先确认合并提交或 cherry-pick 已经进入目标分支；不要为了删除分支而使用 `-D`，那会丢掉未合并的提交。

**5. Codex 改错了工作树。** 看会话启动目录和 `git status`，不要凭对话内容猜。给每个会话的提示词里写明绝对路径和目标分支；任务结束后分别检查两个目录的 diff。

## 验收清单

- [ ] 创建前主工作区干净，且有明确的基线提交。
- [ ] `git worktree list` 能区分主目录和功能目录。
- [ ] 两个 Codex 会话没有修改同一个文件或同一分支。
- [ ] 合并前功能改动已提交并经过测试或人工检查。
- [ ] 移除工作树前 `git status` 干净，没有使用 `--force`。
- [ ] 能说清工作树共享历史，但不提供安全隔离。

## 接下来

如果你在 Windows 上创建工作树，先确认 PowerShell 路径和换行规则：[Windows 下的 Codex 环境](/articles/codex-windows-setup/)。需要给每个工作树设计可验证的改动时，参考 [失败测试驱动修复](/articles/codex-debugging-tests/)；多阶段任务如何设置检查点，可读 [自动化检查点](/articles/automation-checkpoints/)。

## 参考来源

- [Git worktree 官方文档](https://git-scm.com/docs/git-worktree)
- [Codex 沙箱与审批](https://learn.chatgpt.com/docs/agent-approvals-security)

核验范围（2026-11-14）：工作树命令、同一分支限制和移除保护依据 Git 官方文档；分支冲突、脏工作树移除拒绝、合并后清理的实际输出来自本地离线 fixture（Git 2.43.0），路径中的用户名和绝对目录已省略。