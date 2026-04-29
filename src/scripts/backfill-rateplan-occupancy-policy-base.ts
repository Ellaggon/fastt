import {
	and,
	asc,
	db,
	eq,
	EffectivePricing,
	PricingBaseRate,
	RatePlan,
	RatePlanOccupancyPolicy,
} from "astro:db"

type LegacyBase = {
	baseAmount: number
	baseCurrency: string
	source: "pricing_base_rate" | "effective_pricing"
}

function isDryRun(): boolean {
	return process.argv.includes("--dry-run")
}

async function resolveLegacyBase(ratePlanId: string): Promise<LegacyBase | null> {
	const ratePlan = await db
		.select({ variantId: RatePlan.variantId })
		.from(RatePlan)
		.where(eq(RatePlan.id, ratePlanId))
		.get()
	if (!ratePlan?.variantId) return null

	const fromBaseRate = await db
		.select({
			basePrice: PricingBaseRate.basePrice,
			currency: PricingBaseRate.currency,
		})
		.from(PricingBaseRate)
		.where(eq(PricingBaseRate.variantId, String(ratePlan.variantId)))
		.get()
	if (fromBaseRate) {
		return {
			baseAmount: Number(fromBaseRate.basePrice ?? 0),
			baseCurrency: String(fromBaseRate.currency ?? "USD"),
			source: "pricing_base_rate",
		}
	}

	const fromEffective = await db
		.select({
			basePrice: EffectivePricing.basePrice,
		})
		.from(EffectivePricing)
		.where(eq(EffectivePricing.ratePlanId, ratePlanId))
		.orderBy(asc(EffectivePricing.date))
		.get()
	if (!fromEffective) return null

	return {
		baseAmount: Number(fromEffective.basePrice ?? 0),
		baseCurrency: "USD",
		source: "effective_pricing",
	}
}

async function main() {
	const dryRun = isDryRun()
	const policies = await db
		.select({
			id: RatePlanOccupancyPolicy.id,
			ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
			baseAmount: (RatePlanOccupancyPolicy as any).baseAmount,
			baseCurrency: (RatePlanOccupancyPolicy as any).baseCurrency,
		})
		.from(RatePlanOccupancyPolicy)
		.orderBy(asc(RatePlanOccupancyPolicy.ratePlanId), asc(RatePlanOccupancyPolicy.effectiveFrom))
		.all()

	const legacyByRatePlan = new Map<string, LegacyBase | null>()
	let processedRows = 0
	let updatedRows = 0
	let skippedExistingRows = 0
	let missingLegacyRows = 0

	for (const policy of policies) {
		processedRows += 1
		const ratePlanId = String(policy.ratePlanId)
		const currentBaseAmount = Number((policy as any).baseAmount ?? 0)
		const hasExistingBaseAmount = Number.isFinite(currentBaseAmount) && currentBaseAmount > 0
		if (hasExistingBaseAmount) {
			skippedExistingRows += 1
			continue
		}

		if (!legacyByRatePlan.has(ratePlanId)) {
			legacyByRatePlan.set(ratePlanId, await resolveLegacyBase(ratePlanId))
		}
		const legacy = legacyByRatePlan.get(ratePlanId)
		if (!legacy) {
			missingLegacyRows += 1
			continue
		}

		if (!dryRun) {
			await db
				.update(RatePlanOccupancyPolicy)
				.set({
					baseAmount: legacy.baseAmount,
					baseCurrency: legacy.baseCurrency,
				})
				.where(and(eq(RatePlanOccupancyPolicy.id, String(policy.id))))
		}
		updatedRows += 1
		console.log(
			JSON.stringify({
				action: "rateplan_occupancy_policy_base_backfill_row",
				dryRun,
				policyId: String(policy.id),
				ratePlanId,
				baseAmount: legacy.baseAmount,
				baseCurrency: legacy.baseCurrency,
				source: legacy.source,
			})
		)
	}

	console.log(
		JSON.stringify({
			action: "rateplan_occupancy_policy_base_backfill_summary",
			dryRun,
			processedRows,
			updatedRows,
			skippedExistingRows,
			missingLegacyRows,
		})
	)
}

main().catch((error) => {
	console.error(
		JSON.stringify({
			action: "rateplan_occupancy_policy_base_backfill_failed",
			error: error instanceof Error ? error.message : String(error),
		})
	)
	process.exitCode = 1
})
