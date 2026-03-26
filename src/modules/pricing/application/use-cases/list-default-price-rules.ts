import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"
import { ensureDefaultRatePlan } from "./ensure-default-rateplan"

export async function listDefaultPriceRules(
	deps: {
		ratePlanRepo: RatePlanRepositoryPort
		ratePlanCmdRepo: RatePlanCommandRepositoryPort
		pricingRepo: PricingRepositoryPort
	},
	params: { variantId: string }
): Promise<Array<{ id: string; type: string; value: number; createdAt: Date }>> {
	const { ratePlanId } = await ensureDefaultRatePlan(
		{ ratePlanRepo: deps.ratePlanRepo, ratePlanCmdRepo: deps.ratePlanCmdRepo },
		{ variantId: params.variantId }
	)

	return deps.pricingRepo.getPreviewRules(ratePlanId)
}
