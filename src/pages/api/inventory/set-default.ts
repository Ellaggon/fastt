import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import {
	inventoryBootstrapper,
	variantInventoryConfigRepository,
	variantManagementRepository,
	productRepository,
} from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	totalUnits: z.number().int().min(0),
	horizonDays: z.number().int().min(1).max(3650).optional(),
})

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
		const parsed = schema.parse({
			variantId: String(form.get("variantId") ?? "").trim(),
			totalUnits: Number(form.get("totalUnits")),
			horizonDays: form.get("horizonDays") != null ? Number(form.get("horizonDays")) : undefined,
		})

		const v = await variantManagementRepository.getVariantById(parsed.variantId)
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

		await variantInventoryConfigRepository.upsert({
			variantId: parsed.variantId,
			defaultTotalUnits: parsed.totalUnits,
			horizonDays: parsed.horizonDays ?? 365,
		})

		await inventoryBootstrapper.bootstrapVariantInventory({
			variantId: parsed.variantId,
			totalInventory: parsed.totalUnits,
			days: parsed.horizonDays ?? 365,
		})
		await invalidateVariant(parsed.variantId, v.productId)

		return new Response(JSON.stringify({ ok: true }), {
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
