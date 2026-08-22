import { describe } from "vitest"

import { isTestDatabaseEnabled } from "@/shared/infrastructure/db/clean-db-env"

export function hasPostgresForTests(env: NodeJS.ProcessEnv = process.env): boolean {
	return isTestDatabaseEnabled(env)
}

/** Integration suites that need a live Postgres URL. Skips cleanly in CI without secrets. */
export const describePostgres = hasPostgresForTests() ? describe : describe.skip
