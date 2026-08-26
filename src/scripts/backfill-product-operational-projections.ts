import { backfillProductOperationalProjections as runBackfillProductOperationalProjections } from "@/lib/product/backfill-product-operational-projections"

function optionalEnv(name: string): string {
	return String(process.env[name] ?? "").trim()
}

function limitFromEnv(): number {
	const parsed = Number(optionalEnv("LIMIT"))
	if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY
	return Math.floor(parsed)
}

export default async function backfillProductOperationalProjections(): Promise<void> {
	const result = await runBackfillProductOperationalProjections({
		providerId: optionalEnv("PROVIDER_ID") || null,
		productId: optionalEnv("PRODUCT_ID") || null,
		limit: limitFromEnv(),
	})

	console.log(
		JSON.stringify(
			{
				action: "product_operational_projection_backfill",
				...result,
			},
			null,
			2
		)
	)
}
