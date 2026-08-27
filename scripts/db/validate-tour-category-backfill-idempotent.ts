/**
 * Applies 2026-08-19_tour_category_link_backfill.sql twice in one session
 * (outside fastt_schema_migrations skip) and asserts stable category links.
 *
 * After Tour.categoriesJson retirement, greenfield baselines omit the column.
 * In that case the legacy backfill is a no-op and this validator succeeds by
 * confirming the column is already gone.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"

import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"

ensureCleanPostgresEnv()

const MIGRATION = path.resolve("db/migrations/2026-08-19_tour_category_link_backfill.sql")

function connectionUrl(): string {
	const url =
		process.env.DIRECT_URL?.trim() ||
		process.env.SUPABASE_DB_POOLER_URL?.trim() ||
		process.env.DATABASE_URL?.trim() ||
		""
	if (!url) throw new Error("Missing DIRECT_URL / SUPABASE_DB_POOLER_URL / DATABASE_URL")
	return url
}

async function countRows(sql: postgres.Sql, table: string): Promise<number> {
	const rows = await sql.unsafe(`select count(*)::int as n from "${table}"`)
	return Number(rows[0]?.n ?? 0)
}

async function hasTourCategoriesJson(sql: postgres.Sql): Promise<boolean> {
	const rows = await sql<{ exists: boolean }[]>`
		select exists (
			select 1
			from information_schema.columns
			where table_schema = 'public'
				and table_name = 'Tour'
				and column_name = 'categoriesJson'
		) as exists
	`
	return Boolean(rows[0]?.exists)
}

async function main() {
	const source = await readFile(MIGRATION, "utf8")
	const sql = postgres(connectionUrl(), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 20,
	})

	try {
		if (!(await hasTourCategoriesJson(sql))) {
			console.log(
				JSON.stringify(
					{
						action: "skipped_categories_json_retired",
						ok: true,
						reason: "Tour.categoriesJson absent; legacy backfill no longer applicable",
					},
					null,
					2
				)
			)
			return
		}

		await sql.begin(async (tx) => {
			await tx.unsafe(source)
			const linksAfterFirst = await countRows(tx as unknown as postgres.Sql, "ProductCategoryLink")
			const unmappedAfterFirst = await countRows(
				tx as unknown as postgres.Sql,
				"TourCategoryBackfillUnmapped"
			)

			await tx.unsafe(source)
			const linksAfterSecond = await countRows(tx as unknown as postgres.Sql, "ProductCategoryLink")
			const unmappedAfterSecond = await countRows(
				tx as unknown as postgres.Sql,
				"TourCategoryBackfillUnmapped"
			)

			const dupLinks = await tx<{ n: number }[]>`
				select count(*)::int as n
				from (
					select "productId", "categoryId"
					from "ProductCategoryLink"
					group by "productId", "categoryId"
					having count(*) > 1
				) d
			`
			const dupUnmapped = await tx<{ n: number }[]>`
				select count(*)::int as n
				from (
					select "id"
					from "TourCategoryBackfillUnmapped"
					group by "id"
					having count(*) > 1
				) d
			`

			const report = {
				ok: true,
				linksAfterFirst,
				linksAfterSecond,
				unmappedAfterFirst,
				unmappedAfterSecond,
				duplicateLinks: Number(dupLinks[0]?.n ?? 0),
				duplicateUnmapped: Number(dupUnmapped[0]?.n ?? 0),
			}

			if (linksAfterFirst !== linksAfterSecond) {
				throw new Error(
					`ProductCategoryLink count drifted on second apply: ${linksAfterFirst} → ${linksAfterSecond}`
				)
			}
			if (unmappedAfterFirst !== unmappedAfterSecond) {
				throw new Error(
					`TourCategoryBackfillUnmapped count drifted on second apply: ${unmappedAfterFirst} → ${unmappedAfterSecond}`
				)
			}
			if (report.duplicateLinks > 0 || report.duplicateUnmapped > 0) {
				throw new Error(`Duplicates detected: ${JSON.stringify(report)}`)
			}

			console.log(JSON.stringify({ action: "validated_idempotent", ...report }, null, 2))
			throw new Error("__VALIDATE_ROLLBACK__")
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (message === "__VALIDATE_ROLLBACK__") return
		throw error
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
