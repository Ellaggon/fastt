import { readFile } from "node:fs/promises"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import {
	readComplianceSnapshot,
	compareComplianceSnapshots,
} from "@/lib/commercial-policy/migration-integrity"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
suite("compliance migration preservation on PostgreSQL", () => {
	let sql: postgres.Sql
	beforeAll(() => {
		if (isolated.configured)
			sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 1, prepare: false })
	})
	afterAll(async () => {
		if (sql) await sql.end()
	})
	it("reapplies canonical geography migration without changing contracts, evidence or history", async () => {
		const migration = await readFile("db/migrations/2026-10-29_operating_geography.sql", "utf8")
		const rollback = new Error("synthetic_rollback")
		await expect(
			sql.begin(async (tx) => {
				const provider = crypto.randomUUID(),
					document = crypto.randomUUID()
				await tx`insert into "Provider" (id, "accountPurpose", "dataClassification") values (${provider}, 'internal_qa', 'fixture')`
				await tx`insert into "ProviderDocument" (id, "providerId", type, status) values (${document}, ${provider}, 'government_id', 'verified')`
				const before = await readComplianceSnapshot(tx)
				await tx.unsafe(migration)
				const after = await readComplianceSnapshot(tx)
				expect(compareComplianceSnapshots(before, after)).toEqual([])
				await tx`update "ProviderDocument" set "reviewNotes" = 'synthetic change' where id = ${document}`
				expect(compareComplianceSnapshots(after, await readComplianceSnapshot(tx))).toEqual([
					"ProviderDocument",
				])
				throw rollback
			})
		).rejects.toBe(rollback)
	})
})
