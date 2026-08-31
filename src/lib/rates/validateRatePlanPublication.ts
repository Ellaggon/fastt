import { baseRateRepository, variantInventoryConfigRepository } from "@/container"
import { REQUIRED_POLICY_CATEGORIES, resolveEffectivePolicies } from "@/modules/policies/public"
import { and, count, DailyInventory, db, eq, gt } from "@/shared/infrastructure/db/compat"

const MINIMUM_SELLABLE_AVAILABILITY_DAYS = 30

export async function validateRatePlanPublication(params: {
	ratePlanId: string
	variantId: string
	productId: string
}) {
	const todayIso = new Date().toISOString().slice(0, 10)
	const [baseline, inventory, policies, availability] = await Promise.all([
		baseRateRepository.getCanonicalPricingBaselineByRatePlanId(params.ratePlanId),
		variantInventoryConfigRepository.getByVariantId(params.variantId),
		resolveEffectivePolicies({
			productId: params.productId,
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			channel: "web",
			requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
			onMissingCategory: "return_null",
		}),
		db
			.select({ value: count() })
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, params.variantId),
					gt(DailyInventory.date, todayIso),
					gt(DailyInventory.totalInventory, 0)
				)
			),
	])

	const blockers: string[] = []
	if (!baseline || Number(baseline.basePrice) <= 0) blockers.push("precio base")
	if (!inventory || Number(inventory.defaultTotalUnits) <= 0) blockers.push("cupo físico")
	if (policies.missingCategories.length > 0) blockers.push("condiciones obligatorias")
	if (Number(availability[0]?.value ?? 0) < MINIMUM_SELLABLE_AVAILABILITY_DAYS) {
		blockers.push(`${MINIMUM_SELLABLE_AVAILABILITY_DAYS} noches con disponibilidad`)
	}

	return { canPublish: blockers.length === 0, blockers }
}
