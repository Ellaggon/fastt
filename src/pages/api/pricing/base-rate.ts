import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { logger } from "@/lib/observability/logger"
import {
	ensureDefaultRatePlan,
	resolveRatePlanOwnerContext,
	setBaseRate,
} from "@/modules/pricing/public"
import {
	baseRateRepository,
	ratePlanCommandRepository,
	ratePlanRepository,
	variantRepository,
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
		const ratePlanId = String(form.get("ratePlanId") ?? "").trim()
		const variantIdFromClient = String(form.get("variantId") ?? "").trim()
		const currency = String(form.get("currency") ?? "").trim()
		const basePrice = Number(form.get("basePrice"))
		if (!ratePlanId) {
			logger.warn("rateplan_id_required", {
				endpoint: "api.pricing.base-rate",
				hasVariantId: Boolean(variantIdFromClient),
			})
			return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (
			ratePlanId &&
			variantIdFromClient &&
			ownerContext &&
			ownerContext.variantId !== variantIdFromClient
		) {
			logger.warn("rateplan_variant_mismatch_ignored", {
				endpoint: "api.pricing.base-rate",
				ratePlanId,
				clientVariantId: variantIdFromClient,
				derivedVariantId: ownerContext.variantId,
			})
		}
		if (ratePlanId && !ownerContext) {
			logger.warn("rateplan_owner_context_not_found", {
				endpoint: "api.pricing.base-rate",
				ratePlanId,
			})
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const variantId = ownerContext.variantId

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

		const result = await setBaseRate(
			{ baseRateRepo: baseRateRepository, variantRepo: variantRepository },
			{ variantId, currency, basePrice }
		)
		const ensuredDefault = await ensureDefaultRatePlan(
			{
				ratePlanRepo: ratePlanRepository,
				ratePlanCmdRepo: ratePlanCommandRepository,
			},
			{ variantId }
		)
		await invalidateVariant(variantId, v.productId)

		return new Response(
			JSON.stringify({
				...result,
				defaultRatePlanId: ensuredDefault.ratePlanId,
				defaultRatePlanCreated: ensuredDefault.created,
				nextStep: "inventory",
				pricingCoverageReady: false,
				note: "Tarifa base guardada. Falta generar pricing efectivo para vender.",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (e) {
		if (e instanceof ZodError) {
			logger.warn("pricing_base_rate_validation_error", {
				endpoint: "api.pricing.base-rate",
				issues: e.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			})
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		logger.error("pricing_base_rate_unhandled_error", {
			endpoint: "api.pricing.base-rate",
			error: msg,
		})
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
