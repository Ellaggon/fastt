import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { resolveRatePlanIdFromLegacyInput } from "@/lib/pricing/legacy-rateplan-adapter"
import { computePricePreview, PricingPreviewValidationError } from "@/modules/pricing/public"
import {
	baseRateRepository,
	ratePlanRepository,
	pricingRepository,
	variantManagementRepository,
	productRepository,
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

		const result = await computePricePreview(
			{
				baseRateRepo: baseRateRepository,
				ratePlanRepo: ratePlanRepository,
				pricingRepo: pricingRepository,
			},
			{ ratePlanId, variantId: variantId || undefined }
		)

		return new Response(JSON.stringify({ ...result, warnings: warning ? [warning] : [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof PricingPreviewValidationError) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["rules"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
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
