import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("keeps the incremental publication guard aligned with fresh database generation", () => {
	const canonical = readFileSync(
		"src/shared/infrastructure/db/schema/commercial-policy-publication-integrity.sql",
		"utf8"
	).trim()
	expect(
		readFileSync("db/migrations/2026-11-10_versioned_policy_publication_guard.sql", "utf8").trim()
	).toBe(canonical)
	expect(readFileSync("db/postgres/0001_initial_schema.sql", "utf8")).toContain(canonical)
})
