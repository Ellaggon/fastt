import type { APIRoute } from "astro"
import { and, db, EffectivePricing, eq } from "astro:db"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { evaluatePricingRules } from "@/modules/pricing/public"
import { productRepository, variantManagementRepository } from "@/container"

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variantId = String(url.searchParams.get("variantId") ?? "").trim()
		const date = String(url.searchParams.get("date") ?? "").trim()
		const currency = String(url.searchParams.get("currency") ?? "USD")
			.trim()
			.toUpperCase()
		if (!variantId || !date) {
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variant = await variantManagementRepository.getVariantById(variantId)
		if (!variant) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const owned = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const [baseRate, defaultPlan] = await Promise.all([
			variantManagementRepository.getBaseRate(variantId),
			variantManagementRepository.getDefaultRatePlanWithRules(variantId),
		])
		if (!baseRate || !defaultPlan) {
			return new Response(JSON.stringify({ error: "pricing_not_initialized" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const evaluation = evaluatePricingRules({
			basePrice: Number(baseRate.basePrice),
			date,
			ratePlanId: String(defaultPlan.ratePlanId),
			rules: defaultPlan.rules.map((rule) => ({
				id: String(rule.id),
				type: String(rule.type),
				value: Number(rule.value),
				priority: Number((rule as any).priority ?? 10),
				dateRange: (rule as any).dateRange ?? null,
				dayOfWeek: (rule as any).dayOfWeek ?? null,
				createdAt: rule.createdAt,
				isActive: true,
			})),
			includeBreakdown: true,
		})

		const effective = await db
			.select({ finalBasePrice: EffectivePricing.finalBasePrice })
			.from(EffectivePricing)
			.where(
				and(
					eq(EffectivePricing.variantId, variantId),
					eq(EffectivePricing.ratePlanId, String(defaultPlan.ratePlanId)),
					eq(EffectivePricing.date, date)
				)
			)
			.get()

		return new Response(
			JSON.stringify({
				date,
				currency,
				basePrice: Number(baseRate.basePrice),
				finalPrice: effective?.finalBasePrice == null ? null : Number(effective.finalBasePrice),
				computedPrice: Number(evaluation.price),
				breakdown: evaluation.breakdown ?? [],
				appliedRuleIds: evaluation.appliedRuleIds,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
