import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { resolveProductCommercialDiagnosis } from "@/lib/commercial-policy/enforcement"
import { and, db, eq, first, Product } from "@/shared/infrastructure/db/compat"

function json(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** Read-only shadow diagnosis. Live authorization remains in provider-governance. */
export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const providerId = user ? await getProviderIdFromRequest(request, user) : null
	if (!user?.id || !providerId) return json({ error: "Unauthorized" }, 401)
	const url = new URL(request.url)
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId) return json({ error: "productId_required" }, 400)
	const product = await db
		.select({ productType: Product.productType })
		.from(Product)
		.where(and(eq(Product.id, productId), eq(Product.providerId, providerId)))
		.then(first)
	if (!product) return json({ error: "Not found" }, 404)
	const vertical = String(product.productType).toLowerCase()
	if (vertical !== "hotel" && vertical !== "tour" && vertical !== "whole_home") {
		return json({ error: "vertical_unsupported" }, 422)
	}
	try {
		const { diagnosis } = await resolveProductCommercialDiagnosis({ providerId, productId })
		return json({ ...diagnosis, mode: "shadow", productId })
	} catch (error) {
		console.error("commercial_policy_diagnosis_failed", {
			productId,
			error: error instanceof Error ? error.message : String(error),
		})
		return json({ error: "policy_storage_unavailable" }, 503)
	}
}
