import { db, PriceRule, RatePlan, RatePlanTemplate, and, asc, count, desc, eq } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { ratePlanPricingReadRepository } from "@/container"
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
	if (!ratePlanId) return { redirectTo: "/rates/plans" }

	const user = await getUserFromRequest(input.request)
	if (!user) return { redirectTo: "/SignInPage" }

	const providerId = await getProviderIdFromRequest(input.request, user)
	if (!providerId) return { redirectTo: "/SignInPage" }

	const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
	if (!ownerContext) return { redirectTo: "/rates/plans" }
	if (ownerContext.providerId && ownerContext.providerId !== providerId)
		return { redirectTo: "/provider" }

	const displayContext = await resolveRatePlanPricingContext({ providerId, ratePlanId })
	if (!displayContext) return { redirectTo: "/rates/plans" }

	const pricingSummary = await ratePlanPricingReadRepository.getRatePlanPricingSummary(ratePlanId)
	const initialCurrency = pricingSummary?.currency ?? "USD"
	const initialBasePrice = pricingSummary?.basePrice != null ? String(pricingSummary.basePrice) : ""

	const ratePlansRaw = await db
		.select({
			id: RatePlan.id,
			isActive: RatePlan.isActive,
			isDefault: RatePlan.isDefault,
			name: RatePlanTemplate.name,
		})
		.from(RatePlan)
		.leftJoin(RatePlanTemplate, eq(RatePlanTemplate.id, RatePlan.templateId))
		.where(eq(RatePlan.variantId, ownerContext.variantId))
		.orderBy(desc(RatePlan.isDefault), desc(RatePlan.isActive), asc(RatePlan.createdAt))

	const ratePlans = await Promise.all(
		ratePlansRaw.map(async (plan) => {
			const activeRules = Number(
				(
					await db
						.select({ value: count() })
						.from(PriceRule)
						.where(and(eq(PriceRule.ratePlanId, plan.id), eq(PriceRule.isActive, true)))
						.get()
				)?.value ?? 0
			)
			return {
				id: String(plan.id),
				name: String(plan.name ?? "Rate plan"),
				currency: initialCurrency,
				isDefault: Boolean(plan.isDefault),
				isActive: Boolean(plan.isActive),
				modifierLabel:
					activeRules > 0
						? `${activeRules} modificador(es) activo(s)`
						: "Sin modificadores activos",
			}
		})
	)

	const defaultPlan =
		ratePlans.find((plan) => plan.id === String(pricingSummary?.ratePlanId ?? "")) ??
		ratePlans.find((plan) => plan.isDefault && plan.isActive) ??
		null
	const defaultPlanLabel = defaultPlan ? `${defaultPlan.name} (${defaultPlan.id})` : "No existe"
	const defaultRatePlanId = defaultPlan?.id ?? null

	const activeRules = defaultRatePlanId
		? await db
				.select({
					id: PriceRule.id,
					name: PriceRule.name,
					type: PriceRule.type,
					value: PriceRule.value,
					priority: PriceRule.priority,
					dateRangeJson: PriceRule.dateRangeJson,
					dayOfWeekJson: PriceRule.dayOfWeekJson,
				})
				.from(PriceRule)
				.where(
					and(eq(PriceRule.ratePlanId, String(defaultRatePlanId)), eq(PriceRule.isActive, true))
				)
				.orderBy(asc(PriceRule.priority), asc(PriceRule.createdAt), asc(PriceRule.id))
		: []

	const activeRulesForUi = activeRules.map((rule) => {
		const dateFrom =
			rule.dateRangeJson && typeof rule.dateRangeJson === "object"
				? String((rule.dateRangeJson as any).from ?? "").trim() || null
				: null
		const dateTo =
			rule.dateRangeJson && typeof rule.dateRangeJson === "object"
				? String((rule.dateRangeJson as any).to ?? "").trim() || null
				: null
		const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
		const dayOfWeek = Array.isArray(rule.dayOfWeekJson)
			? (rule.dayOfWeekJson as unknown[])
					.map((value) => Number(value))
					.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
			: []
		const rawName = typeof rule.name === "string" ? rule.name.trim() : ""
		const contextFromName =
			rawName.startsWith("ctx:") &&
			(rawName.slice(4) === "season" ||
				rawName.slice(4) === "promotion" ||
				rawName.slice(4) === "day" ||
				rawName.slice(4) === "manual")
				? (rawName.slice(4) as "season" | "promotion" | "day" | "manual")
				: null
		const fallbackContext =
			rule.type === "fixed_override"
				? "manual"
				: dateFrom || dateTo
					? "season"
					: dayOfWeek.length > 0
						? "day"
						: rule.type === "percentage_discount"
							? "promotion"
							: "season"
		const contextKey = contextFromName ?? fallbackContext
		return {
			id: String(rule.id),
			name: rawName || null,
			type: String(rule.type),
			value: Number(rule.value),
			priority: Number(rule.priority ?? 10),
			dateFrom,
			dateTo,
			dayOfWeek,
			hasInvalidDateRange,
			contextKey,
		}
	})

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
