import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("provider workspace preference ownership", () => {
	it("keeps workspace experience exclusively on ProviderUser", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const baseline = read("db/postgres/0001_initial_schema.sql")
		const endpoint = read("src/pages/api/provider/preferences/workspace-experience.ts")
		const migration = read(
			"db/migrations/2026-10-15_retire_provider_profile_workspace_preference.sql"
		)

		expect(schema).toContain('workspaceExperience: text("workspaceExperience")')
		expect(schema).not.toContain('professionalToolsEnabled: boolDefault("professionalToolsEnabled"')
		expect(schema).not.toContain('professionalToolsUpdatedAt: ts("professionalToolsUpdatedAt")')
		expect(schema).not.toContain('professionalToolsUpdatedBy: txtOpt("professionalToolsUpdatedBy")')
		expect(baseline).not.toContain('"professionalToolsEnabled"')
		expect(baseline).not.toContain('"professionalToolsUpdatedAt"')
		expect(baseline).not.toContain('"professionalToolsUpdatedBy"')
		expect(endpoint).not.toContain("professionalToolsEnabled")
		expect(migration).toContain('DROP COLUMN IF EXISTS "professionalToolsEnabled"')
	})
})
