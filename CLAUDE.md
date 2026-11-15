# Claude Code 规则

@AGENTS.md

## Claude Code 差异

- 上面的模型路由（Pi CLI + DeepSeek V4.1 Flash、Codex CLI 评审）只约束 pi 侧；Claude Code 直接实现，不转派 pi。
- `AGENTS.md` 里的 pi-switch 标记区由 pi 维护，规则正文只在那里写一份，本文件不复制。
- 项目级技能补在 `.claude/skills/`（9 个，联接 `~/.agents/skills`），项目关闭的技能在 `.claude/settings.json` 的 `permissions.deny` 里以 `Skill(<name>)` 列出（真实来源仍是全局 `~/.claude/skills`，CC 不支持按项目卸载技能，只能拦调用）。
- 项目级 MCP 在 `.mcp.json`（context7）；langfuse 含密钥留在 user 级，notion 本项目关闭。
- pi 专有能力（pi-subagents、pi-browser-use、browser_*、pi-switch、billion-context）在 Claude Code 不适用，改用内置 Task、WebFetch、`/code-review`。