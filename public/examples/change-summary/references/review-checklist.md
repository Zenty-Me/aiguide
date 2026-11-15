# Review checklist

Use this only when the facts JSON flags a risk.

- Does a behavior change match the issue or request?
- Is a migration reversible, and is a backfill needed?
- Did a lockfile change without a matching manifest change?
- Is a sensitive path name present? Stop before quoting it into a public summary.
- Are tests present but not run? Say "test files changed", not "tests passed".
- Is the change docs-only or does it still touch runtime code?
- Are rollback steps and follow-up owners clear?