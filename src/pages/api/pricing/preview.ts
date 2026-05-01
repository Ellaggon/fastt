import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	computePricePreview,
	PricingPreviewValidationError,
	resolveRatePlanOwnerContext,
} from "@/modules/pricing/public"
import {
	baseRateRepository,
	ratePlanRepository,
	pricingRepository,
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
		const ratePlanId = String(form.get("ratePlanId") ?? "").trim()
		if (!ratePlanId) {
			return new Response(
				JSON.stringify({ error: "ratePlanId is required for pricing mutations" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (!ownerContext) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const targetVariantId = String(ownerContext.variantId)
		const targetProductId = String(ownerContext.productId)

		const owned = await productRepository.ensureProductOwnedByProvider(targetProductId, providerId)
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
			{ ratePlanId, variantId: targetVariantId }
		)

		return new Response(JSON.stringify({ ...result, warnings: [] }), {
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
