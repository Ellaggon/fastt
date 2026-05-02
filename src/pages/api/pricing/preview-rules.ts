import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { resolveRatePlanIdFromLegacyInput } from "@/lib/pricing/legacy-rateplan-adapter"
import { previewPricingRules } from "@/modules/pricing/public"
import {
	baseRateRepository,
	pricingRepository,
	productRepository,
	ratePlanRepository,
	variantManagementRepository,
} from "@/container"

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
		const variantId = String(form.get("variantId") ?? "").trim()
		const explicitRatePlanId = String(form.get("ratePlanId") ?? "").trim()
		const type = String(form.get("type") ?? "").trim()
		const value = Number(form.get("value"))
		const priorityRaw = String(form.get("priority") ?? "").trim()
		const priority = priorityRaw ? Number(priorityRaw) : 10
		const dateFrom = String(form.get("dateFrom") ?? "").trim()
		const dateTo = String(form.get("dateTo") ?? "").trim()
		const dayOfWeekRaw = String(form.get("dayOfWeek") ?? "").trim()
		const dayOfWeek = dayOfWeekRaw
			? dayOfWeekRaw
					.split(",")
					.map((item) => Number(item.trim()))
					.filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
			: undefined
		const from =
			String(form.get("previewFrom") ?? "").trim() || new Date().toISOString().slice(0, 10)
		const horizonDaysRaw = Number(form.get("previewDays") ?? 30)
		const horizonDays =
			Number.isFinite(horizonDaysRaw) && horizonDaysRaw > 0 ? Math.min(horizonDaysRaw, 120) : 30
		const fromDate = new Date(`${from}T00:00:00.000Z`)
		const toDate = new Date(fromDate)
		toDate.setUTCDate(fromDate.getUTCDate() + horizonDays)
		const to = toDate.toISOString().slice(0, 10)

		const { ratePlanId, warning } = await resolveRatePlanIdFromLegacyInput({
			ratePlanId: explicitRatePlanId,
			variantId,
		})
		if (!ratePlanId) {
			return new Response(
				JSON.stringify({ error: "ratePlanId is required for pricing mutations" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const fallbackPlan = await ratePlanRepository.get(ratePlanId)
		const targetVariantId = variantId || String(fallbackPlan?.variantId ?? "")
		const variant = targetVariantId
			? await variantManagementRepository.getVariantById(targetVariantId)
			: null
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

		const result = await previewPricingRules(
			{
				variantRepo: {
					getBaseRateByRatePlanId: (ratePlanId: string) =>
						baseRateRepository.getCanonicalBaseByRatePlanId(ratePlanId),
					getPreviewRulesByRatePlanId: (ratePlanId: string) =>
						pricingRepository.getPreviewRules(ratePlanId),
				},
			},
			{
				ratePlanId,
				variantId: targetVariantId || undefined,
				from,
				to,
				candidateRule: {
					type,
					value,
					priority,
					dateRange:
						dateFrom || dateTo
							? { from: dateFrom || undefined, to: dateTo || undefined }
							: undefined,
					dayOfWeek,
				},
			}
		)
		return new Response(JSON.stringify({ ...result, warnings: warning ? [warning] : [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
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
