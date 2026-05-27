import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ratePlanPricingReadRepository } from "@/container"
import { routes } from "@/lib/routes"
import {
	resolveRatePlanOwnerContext,
	resolveRatePlanPricingContext,
} from "@/modules/pricing/public"

type Input = {
	request: Request
	ratePlanId: string
}

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
			loaded: {
				user: { id: string; email: string }
				providerId: string
				productId: string
				variantId: string
				variant: { id: string; productId: string; name: string }
				initialCurrency: string
				initialBasePrice: string
				ratePlans: Array<{
					id: string
					name: string
					currency: string
					isDefault: boolean
					isActive: boolean
					modifierLabel: string
				}>
				defaultPlanLabel: string
				defaultRatePlanId: string | null
				activeRulesForUi: Array<{
					id: string
					name: string | null
					type: string
					value: number
					priority: number
					dateFrom: string | null
					dateTo: string | null
					dayOfWeek: number[]
					hasInvalidDateRange: boolean
					contextKey: "season" | "promotion" | "day" | "manual"
				}>
				effectivePricingDays: number
				effectivePricingStart: string | null
				effectivePricingEnd: string | null
				coverageGaps: number
				invalidActiveRuleRanges: number
			}
	  }

export async function loadRatePlanPricingData(input: Input): Promise<LoadedRatePlanPricingData> {
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!ratePlanId) return { redirectTo: routes.ratePlansList() }

	const user = await getUserFromRequest(input.request)
	if (!user) return { redirectTo: "/SignInPage" }

	const providerId = await getProviderIdFromRequest(input.request, user)
	if (!providerId) return { redirectTo: "/SignInPage" }

	const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
	if (!ownerContext) return { redirectTo: routes.ratePlansList() }
	if (ownerContext.providerId && ownerContext.providerId !== providerId)
		return { redirectTo: "/provider" }

	const displayContext = await resolveRatePlanPricingContext({ providerId, ratePlanId })
	if (!displayContext) return { redirectTo: routes.ratePlansList() }

	const pricingSummary = await ratePlanPricingReadRepository.getRatePlanPricingSummary(ratePlanId)
	const initialCurrency = pricingSummary?.currency ?? "USD"
	const initialBasePrice = pricingSummary?.basePrice != null ? String(pricingSummary.basePrice) : ""

	const ratePlansRaw = await ratePlanPricingReadRepository.listRatePlanModifierSummaryByVariant(
		ownerContext.variantId
	)
	const ratePlans = ratePlansRaw.map((plan) => ({
		id: plan.id,
		name: plan.name,
		currency: initialCurrency,
		isDefault: plan.isDefault,
		isActive: plan.isActive,
		modifierLabel:
			plan.activeModifiers > 0
				? `${plan.activeModifiers} modificador(es) activo(s)`
				: "Sin modificadores activos",
	}))

	const defaultPlan =
		ratePlans.find((plan) => plan.id === String(pricingSummary?.ratePlanId ?? "")) ??
		ratePlans.find((plan) => plan.isDefault && plan.isActive) ??
		null
	const defaultPlanLabel = defaultPlan ? `${defaultPlan.name} (${defaultPlan.id})` : "No existe"
	const defaultRatePlanId = defaultPlan?.id ?? null

	const activeRulesForUi = defaultRatePlanId
		? await ratePlanPricingReadRepository.listActiveRulesForRatePlan(String(defaultRatePlanId))
		: []

	const invalidActiveRuleRanges = activeRulesForUi.filter((rule) => rule.hasInvalidDateRange).length
	const effectivePricingDays = Number(pricingSummary?.effectivePricingDays ?? 0)
	const coverageGaps = Math.max(30 - effectivePricingDays, 0)

	return {
		ownerContext: { ratePlanId: ownerContext.ratePlanId },
		displayContext: {
			ratePlanName: displayContext.ratePlanName,
			productName: displayContext.productName,
			variantName: displayContext.variantName,
		},
		loaded: {
			user: { id: user.id, email: user.email },
			providerId,
			productId: ownerContext.productId,
			variantId: ownerContext.variantId,
			variant: {
				id: ownerContext.variantId,
				productId: ownerContext.productId,
				name: displayContext.variantName,
			},
			initialCurrency,
			initialBasePrice,
			ratePlans,
			defaultPlanLabel,
			defaultRatePlanId,
			activeRulesForUi,
			effectivePricingDays,
			effectivePricingStart: null,
			effectivePricingEnd: null,
			coverageGaps,
			invalidActiveRuleRanges,
		},
	}
}
