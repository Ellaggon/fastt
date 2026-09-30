import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { setVariantSalesEnabled } from "@/modules/catalog/public"
import { variantManagementRepository, productRepository } from "@/container"
import { buildCompleteToPublishEntryHref } from "@/lib/playbook/complete-to-publish"
import { routes } from "@/lib/routes"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		const providerId = user?.email ? await getProviderIdFromRequest(request) : null
		if (!providerId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

		const form = await request.formData()
		const variantId = String(form.get("variantId") ?? "").trim()
		const salesEnabled = form.get("salesEnabled") === "true"
		const variant = await variantManagementRepository.getVariantById(variantId)
		const ownedProduct = variant
			? await productRepository.ensureProductOwnedByProvider(variant.productId, providerId)
			: null
		if (!variant || !ownedProduct) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}
		if (salesEnabled && isTourProductType(ownedProduct.productType)) {
			return new Response(
				JSON.stringify({
					error: "TOUR_GUIDED_ACTIVATION_REQUIRED",
					message:
						"Activa esta salida desde la revisión guiada para validar precio, condiciones y fechas.",
					nextActionHref: buildCompleteToPublishEntryHref(routes.productPreview(variant.productId)),
				}),
				{ status: 409, headers: { "Content-Type": "application/json" } }
			)
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
