import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated =
	process.env.FASTT_DATA_ENV === "test"
		? prepareIsolatedTestDatabase()
		: { configured: false as const }
const connectionUrl = isolated.configured ? (isolated.directUrl ?? isolated.runtimeUrl) : ""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `tax-version-${randomUUID()}`

const ids = {
	draft: `${prefix}-draft`,
	definitionA: `${prefix}-definition-a`,
	definitionB: `${prefix}-definition-b`,
	versionA: `${prefix}-version-a`,
	versionB: `${prefix}-version-b`,
}

describePostgres("Tax fee current version integrity", () => {
	let sql: postgres.Sql

	async function insertDefinition(id: string, editingState: "draft" | "published") {
		await sql`
			insert into "TaxFeeDefinition" (
				"id", "code", "name", "kind", "calculationType", "value",
				"inclusionType", "appliesPer", "priority", "status", "editingState"
			)
			values (${id}, ${id}, 'Version integrity rule', 'tax', 'percentage', 10,
				'excluded', 'stay', 0, 'active', ${editingState})
		`
	}

	async function cleanup() {
		await sql`
			update "TaxFeeDefinition"
			set "currentVersionId" = null
			where "id" like ${`${prefix}%`}
		`
		await sql`delete from "TaxFeeDefinitionVersion" where "taxFeeDefinitionId" like ${`${prefix}%`}`
		await sql`delete from "TaxFeeDefinition" where "id" like ${`${prefix}%`}`
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
		await cleanup()
	})

	afterAll(async () => {
		if (sql) {
			await cleanup()
			await sql.end()
		}
	})

	it("keeps drafts versionless while accepting a version owned by its definition", async () => {
		await insertDefinition(ids.draft, "draft")
		await insertDefinition(ids.definitionA, "published")
		await sql`
			insert into "TaxFeeDefinitionVersion" (
				"id", "taxFeeDefinitionId", "version", "publicationState", "snapshotJson"
			)
			values (${ids.versionA}, ${ids.definitionA}, 1, 'published', '{}'::jsonb)
		`

		await sql.begin(async (tx) => {
			await tx`
				update "TaxFeeDefinition"
				set "currentVersionId" = ${ids.versionA}
				where "id" = ${ids.definitionA}
			`
		})

		const [rows, constraints] = await Promise.all([
			sql`
				select "id", "currentVersionId"
				from "TaxFeeDefinition"
				where "id" in (${ids.draft}, ${ids.definitionA})
				order by "id"
			`,
			sql`
				select condeferrable, condeferred
				from pg_constraint
				where conname = 'TaxFeeDefinition_currentVersion_same_definition_fk'
			`,
		])

		expect(rows.find((row) => row.id === ids.draft)?.currentVersionId).toBeNull()
		expect(rows.find((row) => row.id === ids.definitionA)?.currentVersionId).toBe(ids.versionA)
		expect(constraints).toEqual([{ condeferrable: true, condeferred: true }])
	})

	it("rejects a current version owned by another definition at transaction commit", async () => {
		await insertDefinition(ids.definitionB, "published")
		await sql`
			insert into "TaxFeeDefinitionVersion" (
				"id", "taxFeeDefinitionId", "version", "publicationState", "snapshotJson"
			)
			values (${ids.versionB}, ${ids.definitionB}, 1, 'published', '{}'::jsonb)
		`

		await expect(
			sql.begin(async (tx) => {
				await tx`
					update "TaxFeeDefinition"
					set "currentVersionId" = ${ids.versionB}
					where "id" = ${ids.definitionA}
				`
			})
		).rejects.toThrow(/TaxFeeDefinition_currentVersion_same_definition_fk/)
	})
})
