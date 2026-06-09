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
- Prefer `codex/*` branches for Codex work unless the user requests another name.
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
- a partial revert would be useful
- the commit is hard to review

Do not split only by layer if one feature naturally spans UI, API, repository, schema, and tests.

## Verification

Before PR-ready work, run the narrowest useful checks and broaden when risk is higher.

Baseline checks:

- `pnpm exec astro check`
- focused `pnpm test ...`
- `pnpm test tests/guardrails` when architecture/navigation/contract rules change
- `git diff --check`

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
