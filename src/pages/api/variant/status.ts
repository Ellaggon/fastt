import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateVariantStatus } from "@/modules/catalog/public"
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
		const variantId = String(form.get("variantId") ?? "").trim()
		const status = String(form.get("status") ?? "").trim()

		const v = await variantManagementRepository.getVariantById(variantId)
		if (!v) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

		const owned = await productRepository.ensureProductOwnedByProvider(v.productId, providerId)
		if (!owned) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })

		const result = await updateVariantStatus(
			{ repo: variantManagementRepository },
			{ variantId, status: status as any }
		)

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
		const status = msg.includes("Variant not found") ? 404 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
