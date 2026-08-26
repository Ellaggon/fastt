import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { setVariantSalesEnabled } from "@/modules/catalog/public"
import { variantManagementRepository, productRepository } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		const providerId = user?.email ? await getProviderIdFromRequest(request) : null
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const form = await request.formData()
		const variantId = String(form.get("variantId") ?? "").trim()
		const salesEnabled = form.get("salesEnabled") === "true"
		const variant = await variantManagementRepository.getVariantById(variantId)
		if (
			!variant ||
			!(await productRepository.ensureProductOwnedByProvider(variant.productId, providerId))
		) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}

		const result = await setVariantSalesEnabled(
			{ repo: variantManagementRepository },
			{ variantId, salesEnabled }
		)
		await invalidateVariant(variantId, variant.productId)
		return new Response(JSON.stringify(result), { status: 200 })
	} catch (error) {
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
			})
		}
		const message = error instanceof Error ? error.message : "Unknown error"
		return new Response(JSON.stringify({ error: message }), {
			status: message === "VARIANT_NOT_READY_FOR_SALES" ? 409 : 500,
		})
	}
}
