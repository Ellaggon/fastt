import { config as loadDotenv } from "dotenv"
import postgres from "postgres"

import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

if (process.env.FASTT_DATA_ENV === "test") {
	loadDotenv({ path: ".env.test", override: false })
	delete process.env.DATABASE_URL
	delete process.env.DIRECT_URL
} else {
	loadDotenv({ path: ".env", override: false })
}

const operationalTables = [
	"TourBookingQuestion",
	"TourDepartureInstance",
	"TourOperationalResource",
	"TourResourceAssignment",
] as const

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const tableRows = await sql<
			{ tableName: string; columns: string[] }[]
		>`
			select
				table_name as "tableName",
				array_agg(column_name order by ordinal_position) as columns
			from information_schema.columns
			where table_schema = 'public' and table_name = any(${operationalTables})
			group by table_name
			order by table_name
		`
		const categoriesColumn = await sql<{ exists: boolean }[]>`
			select exists(
				select 1
				from information_schema.columns
				where table_schema = 'public'
					and table_name = 'Tour'
					and column_name = 'categoriesJson'
			) as exists
		`
		const hasLegacyCategories = Boolean(categoriesColumn[0]?.exists)
		const categoryRows = hasLegacyCategories
			? await sql<
					{
						toursWithLegacyCategories: number
						nonArrayValues: number
						categoryValues: number
						unlinkedValues: number
					}[]
				>`
					with values as (
						select
							t."productId",
							trim(both from case
								when jsonb_typeof(element) = 'string' then element #>> '{}'
								when jsonb_typeof(element) = 'object' then coalesce(element->>'name', element->>'label', element->>'slug', '')
								else ''
							end) as raw_label
						from "Tour" t
						cross join lateral jsonb_array_elements(
							case when jsonb_typeof(t."categoriesJson") = 'array' then t."categoriesJson" else '[]'::jsonb end
						) element
					), normalized as (
						select
							"productId",
							trim(both '-' from regexp_replace(
								translate(lower(raw_label), 'áéíóúüñ', 'aeiouun'),
								'[^a-z0-9]+', '-', 'g'
							)) as slug
						from values
						where raw_label <> ''
					)
					select
						(select count(*)::int from "Tour" where "categoriesJson" is not null) as "toursWithLegacyCategories",
						(select count(*)::int from "Tour" where "categoriesJson" is not null and jsonb_typeof("categoriesJson") <> 'array') as "nonArrayValues",
						(select count(*)::int from normalized) as "categoryValues",
						(select count(*)::int from normalized n where not exists (
							select 1 from "ProductCategoryLink" link
							join "ProductCategory" category on category.id = link."categoryId"
							where link."productId" = n."productId" and category.vertical = 'tour' and category.slug = n.slug
						)) as "unlinkedValues"
				`
			: []
		const unlinkedLabels = hasLegacyCategories
			? await sql<{ rawLabel: string; slug: string; products: number }[]>`
				with values as (
					select
						t."productId",
						trim(both from case
							when jsonb_typeof(element) = 'string' then element #>> '{}'
							when jsonb_typeof(element) = 'object' then coalesce(element->>'name', element->>'label', element->>'slug', '')
							else ''
						end) as raw_label
					from "Tour" t
					cross join lateral jsonb_array_elements(
						case when jsonb_typeof(t."categoriesJson") = 'array' then t."categoriesJson" else '[]'::jsonb end
					) element
				), normalized as (
					select
						"productId",
						raw_label,
						trim(both '-' from regexp_replace(
							translate(lower(raw_label), 'áéíóúüñ', 'aeiouun'),
							'[^a-z0-9]+', '-', 'g'
						)) as slug
					from values
					where raw_label <> ''
				)
				select n.raw_label as "rawLabel", n.slug, count(distinct n."productId")::int as products
				from normalized n
				where not exists (
					select 1 from "ProductCategoryLink" link
					join "ProductCategory" category on category.id = link."categoryId"
					where link."productId" = n."productId" and category.vertical = 'tour' and category.slug = n.slug
				)
				group by n.raw_label, n.slug
				order by products desc, n.raw_label
			`
			: []
		const matchingCategories = await sql<
			{ id: string; slug: string; name: string; isActive: boolean; dataClass: string }[]
		>`
			select id, slug, name, "isActive" as "isActive", "dataClass" as "dataClass"
			from "ProductCategory"
			where vertical = 'tour' and slug in ('adventure', 'wildlife')
			order by slug, id
		`

		const report = {
			operationalTables: tableRows,
			missingOperationalTables: operationalTables.filter(
				(table) => !tableRows.some((row) => row.tableName === table)
			),
			legacyCategories: hasLegacyCategories
				? categoryRows[0]
				: { retired: true, toursWithLegacyCategories: 0, nonArrayValues: 0, categoryValues: 0, unlinkedValues: 0 },
			unlinkedLabels,
			matchingCategories,
		}
		console.log(JSON.stringify(report, null, 2))

		if (report.missingOperationalTables.length > 0) {
			throw new Error(`Missing canonical tour tables: ${report.missingOperationalTables.join(", ")}`)
		}
		if (hasLegacyCategories && Number(categoryRows[0]?.nonArrayValues ?? 0) > 0) {
			throw new Error("Tour.categoriesJson contains non-array values and cannot be retired safely.")
		}
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
