import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { productRepository, variantManagementRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"

const schema = z.object({
	variantId: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
	reason: z.string().min(1).optional(),
})

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const endpointName = "inventory-recompute"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown = {}
		if (contentType.includes("application/json")) {
			payload = await request.json().catch(() => ({}))
		} else {
			const form = await request.formData()
			payload = {
				variantId: String(form.get("variantId") ?? "").trim(),
				from: String(form.get("from") ?? "").trim(),
				to: String(form.get("to") ?? "").trim(),
				reason: String(form.get("reason") ?? "").trim() || undefined,
			}
		}

		const parsed = schema.parse(payload)
		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (!variant) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "variant_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!owned) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await recomputeEffectiveAvailabilityRange({
			variantId: parsed.variantId,
			from: parsed.from,
			to: parsed.to,
			reason: parsed.reason ?? "internal_inventory_recompute",
			idempotencyKey: `internal_inventory_recompute:${parsed.variantId}:${parsed.from}:${parsed.to}`,
		})

		logEndpoint()
		return new Response(JSON.stringify({ ok: true, result }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		logEndpoint()
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
