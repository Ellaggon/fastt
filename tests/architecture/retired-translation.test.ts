import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { canonicalDatabaseTableNames } from "@/shared/infrastructure/db/schema/canonical-schema"
import { databaseTableNames } from "@/shared/infrastructure/db/schema/registry"

describe("Retired Translation table", () => {
	it("keeps polymorphic Translation out of the canonical schema and registry", () => {
		expect(canonicalDatabaseTableNames()).not.toContain("Translation")
		expect(databaseTableNames).not.toContain("Translation")

		const tables = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		expect(tables).not.toContain('pgTable(\n\t"Translation"')
	})

	it("records an explicit, data-protecting retirement migration", () => {
		const migration = readFileSync("db/migrations/2026-09-23_retire_legacy_translation.sql", "utf8")
		expect(migration).toContain("TRANSLATION_RETIRED_TABLE_CONTAINS_DATA")
		expect(migration).toContain('DROP TABLE IF EXISTS "Translation"')
	})
})
