---
name: change-summary
description: Summarize a Git diff as a change summary, PR description, or release note. Use when the user asks what changed, requests a PR summary, or needs a review-ready change list with verification gaps.
license: MIT
compatibility: Requires Git and Node.js 20 or newer.
metadata:
  version: "1.0.0"
---

# Change summary

Turn a Git diff into a short, reviewable summary. Report facts from the diff and the
files; do not invent tests, measurements, or user impact.

## Procedure

1. Establish the base and head revisions. If either is unknown, ask; do not guess.
2. Create the diff outside the conversation:
   `git diff <base>...<head> > /tmp/change.diff`
3. Run the helper from the repository root. If this skill is installed at
   `.claude/skills/change-summary`, the command is:
   `node .claude/skills/change-summary/scripts/collect-change-facts.mjs --diff /tmp/change.diff --pretty`
4. Read `references/review-checklist.md` only when the JSON contains
   `SENSITIVE_PATH_NAMES`, `MIGRATION_CHANGED`, `LOCKFILE_CHANGED`, or
   `TESTS_NOT_CHANGED`. Do not load it for a routine docs-only change.
5. Read `assets/summary-template.md` and fill its sections. Keep file paths exact.
6. Separate "verified by this run" from "not verified". If no test command ran, say so.

## Output rules

- Lead with user-visible behavior, then internal changes.
- Mention migrations, lockfiles, CI changes, and sensitive path names explicitly.
- Keep the summary bounded: one bullet per meaningful change, not per file.
- Never print a diff containing credentials, tokens, private keys, or customer data.

## Boundaries

- This skill is read-only: do not commit, push, deploy, or rewrite history.
- Do not claim a test passed because a test file changed.
- If the helper fails, report its error code and stop; do not reconstruct facts by guessing.
- The helper does not understand semantic impact. The checklist is a prompt for review, not proof.