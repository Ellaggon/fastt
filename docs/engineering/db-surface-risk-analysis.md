# DB Surface Risk Analysis (Phase H)

Last updated: 2026-04-27

## Objective

Assess real exploitability of current DB-related dependency risk (`drizzle-orm`) in this repository.

## 1) Where DB is used

Command used:

```bash
rg -n "from \"astro:db\"|from 'astro:db'" src tests
```

Observed usage pattern:

- API handlers (`src/pages/api/**`)
- SSR pages (`src/pages/**/*.astro`)
- Infrastructure repositories (`src/modules/**/infrastructure/repositories/**`)
- Test support and integration tests (`src/test-support`, `tests/**`)
- Containers assembling infra (`src/container/**`)

Important architectural note:

- Application-layer direct `astro:db` imports were already blocked in prior phases.
- Current direct DB usage is concentrated in infrastructure, APIs, SSR surfaces, and tests.

## 2) Query style and SQL exposure

Command used:

```bash
rg -n "\bsql\b|execute\(|run\(|query\(" src/modules src/pages tests
```

Observed:

- Majority of reads/writes are Drizzle query builder operations.
- Some `sql\`\`` fragments are present (aggregations, predicates, joins, inserts in tests).
- No evidence of string-concatenated SQL with raw unescaped user input in reviewed paths.

## 3) External input paths to DB

Input enters mainly via:

- API request payloads/query params in `src/pages/api/**`
- SSR route/query params in `src/pages/**/*.astro`

Validation controls:

- Extensive `zod` parsing and schema validation in API boundaries and core use-cases.
- Invalid payloads are generally rejected before persistence paths.

## 4) Practical exploitability assessment for `drizzle-orm` advisory

Advisory context:

- Drizzle vulnerability concerns improperly escaped SQL identifiers.

Repo-specific assessment:

- Dynamic identifiers are not a common pattern in current codebase.
- Most SQL statements are static or parametrized via query builder.
- Existing paths rely mostly on controlled column/table references, not runtime identifier injection.

Residual risk:

- Not zero: any future introduction of dynamic identifiers could activate the vulnerable path.
- Current practical runtime exploitability appears **lower than generic advisory severity**, but still non-negligible because affected package is in active runtime stack.

## 5) Risk classification (repo-specific)

- Runtime impact potential: **Medium**
- Current exploitability evidence: **Low-to-Medium**
- Operational urgency: **High for tracking**, **Medium for immediate intervention** (because safe upgrade path currently regresses functional invariants).

## 6) Guardrails required until upstream fix path is viable

1. Keep concurrency invariant tests mandatory for DB upgrades:
   - `tests/integration/inventory-hold.test.ts` race/conflict expectations.
2. Re-run full validation on any `@astrojs/db` or Drizzle change:
   - `npm run check`
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build`
3. Explicitly reject introducing dynamic SQL identifiers without strict sanitization or whitelist strategy.

## 7) Conclusion

The unresolved Drizzle issue is currently an upstream-coupled risk with constrained exploitability in this repo. It should remain a tracked security debt item with strict regression gates, rather than forcing an unstable upgrade that breaks domain invariants.
