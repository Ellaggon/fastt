import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { loadVariantPricingData } from "@/lib/pricing/loadVariantPricingData"
import {
	resolveRatePlanOwnerContext,
	resolveRatePlanPricingContext,
} from "@/modules/pricing/public"

type Input = {
	request: Request
	ratePlanId: string
}

type LoadedVariantPricing = Awaited<ReturnType<typeof loadVariantPricingData>>

export type LoadedRatePlanPricingData =
	| { redirectTo: string }
	| {
			ownerContext: {
				ratePlanId: string
			}
			displayContext: {
				ratePlanName: string
				productName: string
				variantName: string
			}
			loaded: Exclude<LoadedVariantPricing, { redirectTo: string }>
	  }

export async function loadRatePlanPricingData(input: Input): Promise<LoadedRatePlanPricingData> {
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!ratePlanId) return { redirectTo: "/rates/plans" }

	const providerId = await getProviderIdFromRequest(input.request)
	if (!providerId) return { redirectTo: "/SignInPage" }

	const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
	if (!ownerContext) return { redirectTo: "/rates/plans" }
	if (ownerContext.providerId && ownerContext.providerId !== providerId)
		return { redirectTo: "/provider" }
	const displayContext = await resolveRatePlanPricingContext({ providerId, ratePlanId })
	if (!displayContext) return { redirectTo: "/rates/plans" }

	const loaded = await loadVariantPricingData({
		request: input.request,
		productId: ownerContext.productId,
		variantId: ownerContext.variantId,
	})
	if ("redirectTo" in loaded) return loaded

	return {
		ownerContext: {
			ratePlanId: ownerContext.ratePlanId,
		},
		displayContext: {
			ratePlanName: displayContext.ratePlanName,
			productName: displayContext.productName,
			variantName: displayContext.variantName,
		},
		loaded,
	}
}
