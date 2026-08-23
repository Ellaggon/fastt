import { describe } from "vitest"

import { hasIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

export function hasPostgresForTests(env: NodeJS.ProcessEnv = process.env): boolean {
	return hasIsolatedTestDatabase(env)
}

/** Integration suites that need a live Postgres URL. Skips cleanly in CI without secrets. */
export const describePostgres = hasPostgresForTests() ? describe : describe.skip
