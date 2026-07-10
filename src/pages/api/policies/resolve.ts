import type { APIRoute } from "astro"
import { z } from "zod"

import {
	isPolicyResolutionDTO,
	mapResolvedPoliciesToUI,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import { logger } from "@/lib/observability/logger"

const querySchema = z.object({
	productId: z.string().min(1).optional(),
	variantId: z.string().min(1).optional(),
	ratePlanId: z.string().min(1).optional(),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	channel: z.string().min(1).optional(),
	includeTrace: z
		.string()
		.optional()
		.transform((value) => value === "1" || value === "true"),
})

export const GET: APIRoute = async ({ request, url }) => {
	const parsed = querySchema.safeParse({
		productId: String(url.searchParams.get("productId") ?? "").trim() || undefined,
		variantId: String(url.searchParams.get("variantId") ?? "").trim() || undefined,
		ratePlanId: String(url.searchParams.get("ratePlanId") ?? "").trim() || undefined,
		checkIn: String(url.searchParams.get("checkIn") ?? "").trim(),
		checkOut: String(url.searchParams.get("checkOut") ?? "").trim(),
		channel: String(url.searchParams.get("channel") ?? "").trim() || undefined,
		includeTrace: String(url.searchParams.get("includeTrace") ?? "").trim() || undefined,
	})

	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	try {
		const input = parsed.data
		if (!input.ratePlanId) {
			logger.warn("rateplan_id_required", {
				endpoint: "api.policies.resolve",
			})
			return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (input.checkOut <= input.checkIn) {
			logger.warn("invalid_stay_range", {
				endpoint: "api.policies.resolve",
				checkIn: input.checkIn,
				checkOut: input.checkOut,
			})
			return new Response(JSON.stringify({ error: "invalid_stay_range" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const clientProductId = String(input.productId ?? "").trim()
		const clientVariantId = String(input.variantId ?? "").trim()
		const ratePlanId = String(input.ratePlanId ?? "").trim() || undefined
		const ownerContext = ratePlanId ? await resolveRatePlanOwnerContext(ratePlanId) : null
		if (ratePlanId && !ownerContext) {
			logger.warn("rateplan_owner_context_not_found", {
				endpoint: "api.policies.resolve",
				ratePlanId,
			})
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (ratePlanId && ownerContext) {
			const hasMismatch =
				(clientProductId && clientProductId !== ownerContext.productId) ||
				(clientVariantId && clientVariantId !== ownerContext.variantId)
			if (hasMismatch) {
				logger.warn("rateplan_owner_context_mismatch_ignored", {
					endpoint: "api.policies.resolve",
					ratePlanId,
					clientProductId: clientProductId || null,
					clientVariantId: clientVariantId || null,
					derivedProductId: ownerContext.productId,
					derivedVariantId: ownerContext.variantId,
				})
			}
		}
		const productId = String(ownerContext?.productId ?? "").trim()
		const variantId = String(ownerContext?.variantId ?? "").trim() || undefined
		if (!productId) {
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const resolved = await resolveEffectivePolicies({
			productId,
			variantId,
			ratePlanId,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			channel: input.channel ?? "web",
			includeTrace: input.includeTrace,
			featureContext: {
				request,
				query: url.searchParams,
			},
		})
		const policies = mapResolvedPoliciesToUI(resolved)
		return new Response(
			JSON.stringify({
				productId,
				variantId,
				ratePlanId,
				checkIn: input.checkIn,
				checkOut: input.checkOut,
				channel: input.channel ?? "web",
				policies,
				trace:
					input.includeTrace && !isPolicyResolutionDTO(resolved) && "trace" in (resolved as any)
						? ((resolved as any).trace ?? null)
						: null,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		logger.error("policies_resolve_unhandled_error", {
			endpoint: "api.policies.resolve",
			error: error instanceof Error ? error.message : String(error),
		})
		return new Response(JSON.stringify({ error: "internal_error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
