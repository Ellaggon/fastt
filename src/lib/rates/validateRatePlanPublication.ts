import { baseRateRepository, variantInventoryConfigRepository } from "@/container"
import { REQUIRED_POLICY_CATEGORIES, resolveEffectivePolicies } from "@/modules/policies/public"

export async function validateRatePlanPublication(params: {
	ratePlanId: string
	variantId: string
	productId: string
}) {
	const [baseline, inventory, policies] = await Promise.all([
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
	])

	const blockers: string[] = []
	if (!baseline || Number(baseline.basePrice) <= 0) blockers.push("precio base")
	if (!inventory || Number(inventory.defaultTotalUnits) <= 0) blockers.push("cupo físico")
	if (policies.missingCategories.length > 0) blockers.push("condiciones obligatorias")

	return { canPublish: blockers.length === 0, blockers }
}
