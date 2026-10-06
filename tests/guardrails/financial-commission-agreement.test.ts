import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { staleReasonLabels } from "@/pages/financial/_client/financial-labels"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

function commissionSnapshotTableBlock(source: string, tableName = "CommissionSnapshot"): string {
	const start = source.indexOf(`CREATE TABLE "${tableName}" (`)
	expect(start, `${tableName} missing in schema`).toBeGreaterThan(-1)
	return source.slice(start, source.indexOf(");", start))
}

describe("Guardrail: commission snapshots carry the accepted commercial line (G7)", () => {
	it("keeps commercialLine/agreementVersion nullable and aligned across Drizzle, baseline and migration", () => {
		const drizzle = read("src/shared/infrastructure/db/schema/tables.ts")
		const drizzleBlock = drizzle.slice(
			drizzle.indexOf('export const CommissionSnapshot = pgTable('),
			drizzle.indexOf("export const", drizzle.indexOf('export const CommissionSnapshot = pgTable(') + 10)
		)
		expect(drizzleBlock).toContain('commercialLine: txtOpt("commercialLine")')
		expect(drizzleBlock).toContain('agreementVersion: txtOpt("agreementVersion")')

		const baseline = read("db/postgres/0001_initial_schema.sql")
		const baselineTable = commissionSnapshotTableBlock(baseline)
		expect(baselineTable).toMatch(/"commercialLine" text,/)
		expect(baselineTable).toMatch(/"agreementVersion" text,/)
		expect(baseline).toContain(
			'CREATE INDEX "CommissionSnapshot_provider_line_idx" ON "CommissionSnapshot" ("providerId", "commercialLine")'
		)

		const migration = read("db/migrations/2026-10-06_commission_snapshot_commercial_line.sql")
		expect(migration).toContain('ADD COLUMN IF NOT EXISTS "commercialLine" text')
		expect(migration).toContain('ADD COLUMN IF NOT EXISTS "agreementVersion" text')
		expect(migration).toContain("CommissionSnapshot_commercialLine_check")
		expect(migration).toContain("'undeclared'")
	})

	it("routes every commission snapshot write through the agreement resolver", () => {
		const repository = read(
			"src/modules/financial/infrastructure/repositories/CommissionSnapshotRepository.ts"
		)
		expect(repository).not.toContain("values(row as any)")
		expect(repository).toContain("commercialLine: row.commercialLine")
		expect(repository).toContain("agreementVersion: row.agreementVersion")

		const useCase = read(
			"src/modules/financial/application/use-cases/create-commission-snapshot.ts"
		)
		expect(useCase).toContain('"commercialLine" | "agreementVersion"')
		expect(useCase).toContain("resolveAgreement")

		const seed = read("src/scripts/seed-financial-operational-demo.ts")
		expect(seed).toContain("commercialLine: demoCommercialLine")
		expect(seed).toContain("agreementVersion: demoAgreementVersion")
	})

	it("gives every stale reason emitted by the provider finance read model a human label", () => {
		const sources = [
			read("src/modules/financial/application/use-cases/build-provider-finance-materialization.ts"),
			read("src/modules/financial/application/use-cases/build-provider-finance-summary.ts"),
		].join("\n")
		const emitted = new Set(
			[
				...sources.matchAll(
					/"((?:commission|payable|statement|reconciliation)_[a-z_]+_(?:stale|mismatch|undeclared|ambiguous|blocked))"/g
				),
			].map((match) => match[1])
		)
		expect(emitted.size).toBeGreaterThan(5)
		const missing = [...emitted].filter((reason) => !(reason in staleReasonLabels))
		expect(missing).toEqual([])
	})
})
