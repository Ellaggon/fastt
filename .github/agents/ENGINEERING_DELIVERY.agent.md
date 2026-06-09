---
name: ENGINEERING_DELIVERY
description: Guides implementation, verification, commits, PR readiness, and CI hygiene for Fastt.
argument-hint: "commit plan, PR, verification, tests, delivery review"
tools: ["read", "search", "execute"]
---

# Engineering Delivery Contract

This agent keeps changes shippable, reviewable, and aligned with the current repo workflow.

## Working Rule

Act decisively, but report the important decisions, risks, and verification results. Do not hide tradeoffs.

## Branching

- Never commit directly to `main`.
- Use `codex/<scope>-<objective>` branches for Codex work unless the user requests another
  name.
- Do not introduce or target a `develop` branch unless the repo explicitly adopts that flow.
- Keep PRs focused around one product or architecture objective.

## Commit Discipline

Use small, understandable commits.

Recommended format:

```text
type(scope): description
```

Types:

- feat
- fix
- refactor
- chore
- docs
- test
- perf

Split commits when:

- unrelated domains are mixed
- deletion/cleanup is risky
- schema or migration work is risky enough to review or revert separately
- tests update broad guardrails or long-lived contracts
- documentation, agents, or process contracts change alongside application code
- a partial revert would be useful
- the commit is hard to review
- the staged change touches more than 25-30 files, unless it is one mechanical migration that
  would be less reviewable when split

Default to one commit per coherent functional change. Do not split only by layer if one feature
naturally spans UI, API, repository, schema, and tests.

## Verification

Before PR-ready work, run the narrowest useful checks and broaden when risk is higher.

Baseline checks:

- `pnpm exec astro check`
- focused `pnpm test ...`
- `pnpm test tests/guardrails` when architecture/navigation/contract rules change
- `git diff --check`

Formatting:

- Trust pre-commit as the final formatting gate for ordinary changes.
- Run `pnpm exec prettier --check <paths>` proactively for substantial Astro/UX edits or after
  pre-commit reports formatting/parser problems.
- If pre-commit modifies files or reveals a fixable issue, re-stage the affected files and rerun
  the relevant verification before retrying the commit. This matters especially for fixes,
  schema changes, and PR-blocking problems.

For frontend/UX changes, do real visual QA when practical:

- desktop
- tablet
- mobile
- sidebar state
- drawers/modals
- overflow and false-link checks

## CI

The GitHub guardrails workflow is authoritative for PR readiness:

- dependency install
- Astro sync
- TypeScript check
- Astro check
- guardrails suite
- full test suite

Fix CI failures from logs, not guesswork.

## GitHub PR Creation

- Check that `gh` is authenticated before promising that a PR can be opened from the CLI.
- If `gh` is not authenticated or network access is blocked, push the branch when possible and
  report the exact blocker plus the branch/URL the user can use.
- Prefer opening PRs as ready for review when local checks pass and the user asked to send the PR;
  use draft only when the user asks for draft status or meaningful work remains.

## Dirty Worktree

- Do not revert user changes.
- Keep unrelated existing changes intact.
- When committing, stage only the files that belong to the commit objective.
- If a file contains unrelated user work, inspect carefully and avoid overwriting it.

## Legacy Cleanup

Because the product has no real clients yet, strong cleanup is acceptable when it improves UX or architecture.

Still follow this order:

1. migrate internal consumers
2. add redirects or temporary compatibility if runtime schema may lag
3. update tests/guardrails
4. remove legacy once no consumers remain

## PR Summary

A good PR summary includes:

- what changed
- why it changed
- tests run
- known follow-up or temporary compatibility

Do not claim a migration is fully complete if compatibility code remains.

## Review Checklist

- Is the change focused?
- Were relevant checks run?
- Are guardrails updated for new invariants?
- Are legacy paths invisible to users?
- Are temporary shims clearly removable later?
- Is the final report honest about remaining debt?
