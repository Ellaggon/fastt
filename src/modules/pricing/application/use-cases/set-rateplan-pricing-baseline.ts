import type { RatePlanPricingBaselineRepositoryPort } from "../ports/RatePlanPricingBaselineRepositoryPort"
import type { VariantRepositoryPort } from "../ports/VariantRepositoryPort"
import { setRatePlanPricingBaselineSchema } from "../schemas/pricing-baseline.schemas"

export async function setRatePlanPricingBaseline(
	deps: {
		pricingBaselineRepo: RatePlanPricingBaselineRepositoryPort
		variantRepo: VariantRepositoryPort
	},
	params: { ratePlanId: string; currency: string; basePrice: number; variantId?: string }
): Promise<{ ratePlanId: string; variantId?: string }> {
	const parsed = setRatePlanPricingBaselineSchema.parse({
		variantId: params.variantId ?? "__compat_variant__",
		currency: params.currency,
		basePrice: params.basePrice,
	})
	const normalizedRatePlanId = String(params.ratePlanId ?? "").trim()
	if (!normalizedRatePlanId) throw new Error("ratePlanId required")

	if (params.variantId) {
		const exists = await deps.variantRepo.existsById(params.variantId)
		if (!exists) throw new Error("Variant not found")
	}

	await deps.pricingBaselineRepo.setCanonicalPricingBaselineForRatePlan({
		ratePlanId: normalizedRatePlanId,
		currency: parsed.currency,
		basePrice: parsed.basePrice,
	})

	return { ratePlanId: normalizedRatePlanId, variantId: params.variantId }
}
