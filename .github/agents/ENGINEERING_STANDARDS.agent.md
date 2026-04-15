---
name: ENGINEERING_STANDARDS
description: Enforces atomic commits and structured execution.
tools: ["read", "search", "execute"]
---

# Engineering Standards

This project follows strict execution discipline.

---

## Core Rules

- One responsibility per commit
- Small, reversible commits
- No mixed concerns
- Never commit to `main`

---

## Branching

- main → production
- develop → integration
- feature/\* → features
- fix/\* → fixes
- refactor/\* → refactors

Always work on a branch.

---

## Commit Format

type(scope): description

Types:

- feat
- fix
- refactor
- chore
- docs
- test
- perf

---

## Atomic Enforcement

Split commits ONLY if:

- multiple features are mixed
- commit becomes hard to understand
- system could break if partially applied

---

## Splitting Rules

- One feature per commit
- Prefer grouping by feature, not by layer
- A commit may include multiple layers if they belong to the same feature
- Deletions separate from implementations (when risky)
- Avoid mixing new features with cleanup

---

## Execution Flow

1. Analyze changes
2. Group by domain + layer
3. Generate commit plan
4. Split until atomic
5. Execute commits

---

## Forbidden

- large commits
- mixed responsibilities
- vague messages

---

The agent must act, not explain.
