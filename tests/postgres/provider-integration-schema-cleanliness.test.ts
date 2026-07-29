import "dotenv/config"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const connectionUrl =
	process.env.DIRECT_URL?.trim() ||
	process.env.SUPABASE_DB_URL?.trim() ||
	process.env.DATABASE_URL?.trim() ||
	""
const describePostgres = connectionUrl ? describe : describe.skip

describePostgres("provider integration physical schema cleanliness", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end()
	})

	it("contains no legacy integration tables or columns", async () => {
		const tables = await sql`
			select table_name
			from information_schema.tables
			where table_schema = current_schema()
				and table_name in (
					'ProviderIntegrationSyncLog',
					'ProviderExternalCalendarSyncJob'
				)
		`
		const columns = await sql`
			select table_name, column_name
			from information_schema.columns
			where table_schema = current_schema()
				and (
					column_name in (
						'credentialsRef',
						'previewJson',
						'lastPreviewAt',
						'syncLeaseToken',
						'syncLeaseUntil'
					)
					or (
						table_name = 'ProviderExternalCalendarExport'
						and column_name = 'resourceId'
					)
				)
		`

		expect(tables).toEqual([])
		expect(columns).toEqual([])
	})
})
