import { backfillProductPreparationSnapshots as runProductPreparationSnapshotBackfill } from "@/lib/playbook/backfill-product-preparation-snapshots"

function optionalEnv(name: string): string {
	return String(process.env[name] ?? "").trim()
}

function limitFromEnv(): number {
	const parsed = Number(optionalEnv("LIMIT"))
	if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY
	return Math.floor(parsed)
}

export default async function backfillProductPreparationSnapshots(): Promise<void> {
	const result = await runProductPreparationSnapshotBackfill({
		providerId: optionalEnv("PROVIDER_ID") || null,
		productId: optionalEnv("PRODUCT_ID") || null,
		limit: limitFromEnv(),
	})

	console.log(
		JSON.stringify(
			{
				action: "product_preparation_snapshot_backfill",
				...result,
			},
			null,
			2
		)
	)
}
