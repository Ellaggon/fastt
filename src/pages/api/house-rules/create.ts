import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getProductById } from "@/modules/catalog/public"
import { createHouseRule } from "@/modules/house-rules/public"

export const POST: APIRoute = async ({ request }) => {
	// Auth + provider required.
	let providerId: string
	try {
		const res = await requireProvider(request)
		providerId = res.providerId
	} catch (e: any) {
		if (e instanceof Response) return e
		return new Response("Unauthorized", { status: 401 })
	}

	const form = await request.formData()
	const productId = String(form.get("productId") ?? "").trim()
	const type = String(form.get("type") ?? "").trim()
	const description = String(form.get("description") ?? "").trim()

	if (!productId)
		return new Response(JSON.stringify({ error: "validation_error" }), { status: 400 })

	// Ownership: product must belong to provider.
	const product = await getProductById(productId)
	if (!product || String(product.providerId ?? "") !== providerId)
		return new Response("Not found", { status: 404 })

	try {
		const created = await createHouseRule({ productId, type, description })
		return new Response(JSON.stringify(created), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e: any) {
		return new Response(
			JSON.stringify({ error: "validation_error", message: String(e?.message ?? e) }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
