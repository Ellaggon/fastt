import "dotenv/config"

import postgres from "postgres"

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

async function main() {
	const sql = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})
	try {
		const [counts] = await sql`
			select
				(select count(*) from "Product")::int as products,
				(select count(*) from "ProductOperationalSurface")::int as product_surfaces,
				(select count(*) from "Provider")::int as providers,
				(select count(*) from "ProviderConfigurationState")::int as provider_states,
				(select count(*) from "RatePlan")::int as rate_plans,
				(select count(*) from "RatePlanConditionState")::int as condition_states,
				(select count(*) from "FinancialProviderSummary")::int as financial_summaries,
				(select count(*) from "SearchUnitView")::int as search_units,
				(select count(*) from "SearchMaterializationLog")::int as search_materialization_logs,
				(select count(distinct "variantId") from "SearchUnitView")::int as search_variants,
				(select count(*) from "Variant" where "isActive" = true)::int as active_variants
		`
		const [search] = await sql`
			select
				min(date)::text as min_date,
				max(date)::text as max_date,
				max("computedAt") as last_computed_at,
				count(*) filter (where "computedAt" >= now() - interval '10 minutes')::int as fresh_10m,
				count(*) filter (
					where date >= current_date
						and date < current_date + interval '30 days'
				)::int as next_30d_rows
			from "SearchUnitView"
		`
		const productSurfaceSamples = await sql`
			select
				"productId",
				"productName",
				"variantCount",
				"activeVariantCount",
				"conditionsHref"
			from "ProductOperationalSurface"
			order by "updatedAt" desc
			limit 5
		`
		const searchMaterialization = await sql`
			select
				"runId",
				trigger,
				status,
				"rowsMaterialized",
				"variantsScanned",
				"durationMs",
				"errorMessage",
				"startedAt",
				"finishedAt"
			from "SearchMaterializationLog"
			order by "createdAt" desc
			limit 5
		`
		console.log(
			JSON.stringify(
				{
					counts,
					search,
					searchMaterialization,
					productSurfaceSamples,
				},
				null,
				2
			)
		)
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
