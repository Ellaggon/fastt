import { describe } from "vitest"

import { isValidPostgresConnectionUrl } from "@/shared/infrastructure/db/clean-db-env"

export function hasPostgresForTests(env: NodeJS.ProcessEnv = process.env): boolean {
	return (
		isValidPostgresConnectionUrl(env.SUPABASE_DB_POOLER_URL) ||
		isValidPostgresConnectionUrl(env.DATABASE_URL) ||
		isValidPostgresConnectionUrl(env.DIRECT_URL)
	)
}

/** Integration suites that need a live Postgres URL. Skips cleanly in CI without secrets. */
export const describePostgres = hasPostgresForTests() ? describe : describe.skip
