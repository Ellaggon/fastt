import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { deletePriceRule, ensurePricingCoverageRuntime } from "@/modules/pricing/public"
import {
	priceRuleCommandRepository,
	priceRuleQueryRepository,
	variantManagementRepository,
	productRepository,
} from "@/container"

const REMATERIALIZE_HORIZON_DAYS = 60

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
	const next = new Date(value)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

export const POST: APIRoute = async ({ request }) => {
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

		const form = await request.formData()
		const ruleId = String(form.get("ruleId") ?? "").trim()

		const variantId = await priceRuleQueryRepository.getVariantIdByRuleId(ruleId)
		if (!variantId) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const v = await variantManagementRepository.getVariantById(variantId)
		if (!v) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const owned = await productRepository.ensureProductOwnedByProvider(v.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await deletePriceRule(
			{ priceRuleCmdRepo: priceRuleCommandRepository },
			{ ruleId }
		)

		const defaultPlan = await variantManagementRepository.getDefaultRatePlanWithRules(variantId)
		if (defaultPlan) {
			const today = new Date()
			today.setUTCHours(0, 0, 0, 0)
			const from = toDateOnly(today)
			const to = toDateOnly(addDays(today, REMATERIALIZE_HORIZON_DAYS))
			const rematerialize = await ensurePricingCoverageRuntime({
				variantId,
				ratePlanId: defaultPlan.ratePlanId,
				from,
				to,
				recomputeExisting: true,
			})
			console.debug("pricing_rule_deleted_materialized", {
				ruleId,
				variantId,
				ratePlanId: defaultPlan.ratePlanId,
				from,
				to,
				generatedDatesCount: rematerialize.generatedDatesCount,
			})
		}

		await invalidateVariant(variantId, v.productId)

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
