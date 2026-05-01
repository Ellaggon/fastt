import type { APIRoute } from "astro"
import { and, db, desc, eq, RatePlanOccupancyPolicy } from "astro:db"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { logger } from "@/lib/observability/logger"
import { setBaseRateSchema } from "@/modules/pricing/application/schemas/base-rate.schemas"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { variantManagementRepository, productRepository } from "@/container"

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
		if (!ownerContext) {
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const variantId = ownerContext.variantId
		setBaseRateSchema.parse({ variantId, currency, basePrice })

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

		const normalizedCurrency = String(currency).trim().toUpperCase()
		const normalizedBasePrice = Number(basePrice)
		const nowDateOnly = new Date().toISOString().slice(0, 10)
		const existingPolicy = await db
			.select({ id: RatePlanOccupancyPolicy.id })
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, ratePlanId),
					eq(RatePlanOccupancyPolicy.baseAdults, 2),
					eq(RatePlanOccupancyPolicy.baseChildren, 0)
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.get()
		if (existingPolicy?.id) {
			await db
				.update(RatePlanOccupancyPolicy)
				.set({
					baseAmount: normalizedBasePrice,
					currency: normalizedCurrency,
					baseCurrency: normalizedCurrency,
				})
				.where(eq(RatePlanOccupancyPolicy.id, existingPolicy.id))
		} else {
			await db.insert(RatePlanOccupancyPolicy).values({
				id: crypto.randomUUID(),
				ratePlanId,
				baseAdults: 2,
				baseChildren: 0,
				extraAdultMode: "fixed",
				extraAdultValue: 0,
				childMode: "fixed",
				childValue: 0,
				currency: normalizedCurrency,
				baseAmount: normalizedBasePrice,
				baseCurrency: normalizedCurrency,
				effectiveFrom: nowDateOnly,
				effectiveTo: "2099-12-31",
				createdAt: new Date(),
			} as any)
		}
		await invalidateVariant(variantId, v.productId)

		return new Response(
			JSON.stringify({
				variantId,
				defaultRatePlanId: ratePlanId,
				defaultRatePlanCreated: false,
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
