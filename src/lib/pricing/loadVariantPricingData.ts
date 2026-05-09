import { productRepository, variantManagementRepository } from "@/container"
import { ratePlanPricingReadRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

type Input = {
	request: Request
	productId: string
	variantId: string
}

type RatePlanItem = {
	id: string
	name: string
	currency: string
	isDefault: boolean
	isActive: boolean
	modifierLabel: string
}

export async function loadVariantPricingData(input: Input): Promise<
	| {
			redirectTo: string
	  }
	| {
			user: { id: string; email: string }
			providerId: string
			productId: string
			variantId: string
			variant: { id: string; productId: string; name: string }
			initialCurrency: string
			initialBasePrice: string
			ratePlans: RatePlanItem[]
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
> {
	const user = await getUserFromRequest(input.request)
	if (!user) return { redirectTo: "/SignInPage" }

	const providerId = (await getProviderIdFromRequest(input.request, user)) ?? ""
	if (!providerId) return { redirectTo: "/provider" }
	if (!input.productId) return { redirectTo: "/product/create" }
	if (!input.variantId)
		return { redirectTo: `/product/${encodeURIComponent(input.productId)}/variants` }

	const variant = await variantManagementRepository.getVariantById(input.variantId)
	if (!variant || variant.productId !== input.productId) {
		return { redirectTo: `/product/${encodeURIComponent(input.productId)}/variants` }
	}
	const owned = await productRepository.ensureProductOwnedByProvider(input.productId, providerId)
	if (!owned) return { redirectTo: "/product/create" }

	const pricingSummary =
		await ratePlanPricingReadRepository.getDefaultRatePlanPricingSummaryByVariant(input.variantId)
	const initialCurrency = pricingSummary?.currency ?? "USD"
	const initialBasePrice = pricingSummary?.basePrice != null ? String(pricingSummary.basePrice) : ""

	const ratePlansRaw = await ratePlanPricingReadRepository.listRatePlanModifierSummaryByVariant(
		input.variantId
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
		user: { id: user.id, email: user.email },
		providerId,
		productId: input.productId,
		variantId: input.variantId,
		variant: { id: variant.id, productId: variant.productId, name: variant.name },
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
	}
}
