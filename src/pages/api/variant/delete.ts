import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { productRepository, variantManagementRepository } from "@/container"
import { deleteVariant } from "@/modules/catalog/public"

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

		const contentType = request.headers.get("content-type") ?? ""
		const variantId = contentType.includes("application/json")
			? String((await request.json())?.variantId ?? "").trim()
			: String((await request.formData()).get("variantId") ?? "").trim()
		if (!variantId) {
			return new Response(JSON.stringify({ error: "variantId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variant = await variantManagementRepository.getVariantById(variantId)
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

		const result = await deleteVariant({ repo: variantManagementRepository }, { variantId })
		await invalidateVariant(variantId, variant.productId)

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "internal_error"
		const status =
			message === "variant_has_transactions" ? 409 : message.includes("not found") ? 404 : 500
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
