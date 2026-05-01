import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { listDefaultPriceRules, resolveRatePlanOwnerContext } from "@/modules/pricing/public"
import {
	ratePlanRepository,
	ratePlanCommandRepository,
	pricingRepository,
	productRepository,
} from "@/container"

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

		const ratePlanId = String(url.searchParams.get("ratePlanId") ?? "").trim()
		if (!ratePlanId) {
			return new Response(JSON.stringify({ error: "ratePlanId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (!ownerContext) {
			return new Response(JSON.stringify({ error: "ratePlan_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		const owned = await productRepository.ensureProductOwnedByProvider(
			String(ownerContext.productId),
			providerId
		)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const rules = await listDefaultPriceRules(
			{
				ratePlanRepo: ratePlanRepository,
				ratePlanCmdRepo: ratePlanCommandRepository,
				pricingRepo: pricingRepository,
			},
			{ ratePlanId }
		)

		return new Response(JSON.stringify({ rules }), {
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
