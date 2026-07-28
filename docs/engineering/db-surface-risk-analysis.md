# DB Surface Risk Analysis (Phase H)

Last updated: 2026-07-28

## Objective

Describe the canonical PostgreSQL surface and its query-safety guardrails.

## 1) Where DB is used

Command used:

```bash
rg -n "shared/infrastructure/db/compat" src tests
```

Observed usage pattern:

- API handlers (`src/pages/api/**`)
- SSR pages (`src/pages/**/*.astro`)
- Infrastructure repositories (`src/modules/**/infrastructure/repositories/**`)
- Test support and integration tests (`src/test-support`, `tests/**`)
- Containers assembling infra (`src/container/**`)

Important architectural note:

- Astro DB/libSQL imports are prohibited across `src`.
- The compatibility module delegates directly to the Supabase PostgreSQL client and canonical schema.
- Direct DB usage remains concentrated in infrastructure, APIs, SSR surfaces, and tests.

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

## 4) Query-safety assessment

Repo-specific assessment:

- Dynamic identifiers are not a common pattern in current codebase.
- Most SQL statements are static or parametrized via query builder.
- Existing paths rely mostly on controlled column/table references, not runtime identifier injection.

Residual risk:

- Not zero: any future introduction of dynamic identifiers could activate the vulnerable path.
- Current practical identifier-injection exposure appears low, while normal value parameters remain bound by Drizzle/PostgreSQL.

## 5) Risk classification (repo-specific)

- Runtime impact potential: **Medium**
- Current exploitability evidence: **Low-to-Medium**
- Operational urgency: **Medium for continuous dependency monitoring**

## 6) Guardrails required until upstream fix path is viable

1. Keep concurrency invariant tests mandatory for DB upgrades:
   - `tests/integration/inventory-hold.test.ts` race/conflict expectations.
2. Re-run full validation on any Drizzle or PostgreSQL client change:
   - `pnpm exec astro check`
   - `pnpm exec tsc --noEmit`
   - `pnpm test`
   - `pnpm build`
3. Explicitly reject introducing dynamic SQL identifiers without strict sanitization or whitelist strategy.

## 7) Conclusion

Supabase PostgreSQL is the sole persistence target. The remaining risk is ordinary ORM/client
upgrade risk, controlled through static query construction, validated boundaries, architecture
tests and concurrency regression tests.
