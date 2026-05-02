import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"

export async function listDefaultPriceRules(
	deps: {
		ratePlanRepo: RatePlanRepositoryPort
		ratePlanCmdRepo: RatePlanCommandRepositoryPort
		pricingRepo: PricingRepositoryPort
	},
	params: { ratePlanId: string }
): Promise<
	Array<{
		id: string
		type: string
		value: number
		priority: number
		dateRangeJson?: { from?: string | null; to?: string | null } | null
		dayOfWeekJson?: number[] | null
		createdAt: Date
	}>
> {
	const ratePlanId = String(params.ratePlanId ?? "").trim()
	if (!ratePlanId) throw new Error("ratePlanId_required")
	return deps.pricingRepo.getPreviewRules(ratePlanId)
}
