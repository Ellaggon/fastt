import type { APIRoute } from "astro"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProductImages } from "@/modules/catalog/public"
import { productImageRepository, productRepository } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	try {
		const MAX_IMAGES_PER_PRODUCT = 20

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
		const productId = String(form.get("productId") ?? "").trim()
		const imageIds = form
			.getAll("imageId")
			.map((v) => String(v || "").trim())
			.filter(Boolean)

		if (!productId) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["productId"], message: "productId required" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (imageIds.length === 0) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["imageId"], message: "At least one imageId is required" }],
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (imageIds.length > MAX_IMAGES_PER_PRODUCT) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [
						{ path: ["imageId"], message: `Max ${MAX_IMAGES_PER_PRODUCT} images per product` },
					],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}
		const unique = new Set(imageIds)
		if (unique.size !== imageIds.length) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["imageId"], message: "Duplicate imageId in request" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		const existing = await productImageRepository.listByProduct(productId)
		const existingById = new Map(existing.map((r: any) => [String(r.id), r]))
		const unknown = imageIds.filter((id) => !existingById.has(id))
		if (unknown.length > 0) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: unknown.map((id) => ({ path: ["imageId"], message: `Unknown imageId: ${id}` })),
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

		console.log(
			JSON.stringify({ action: "product_images_set", productId, count: imageIds.length, ok: true })
		)
		// Delegate all DB writes to the existing images use-case (reused system).
		return updateProductImages({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			repo: productImageRepository,
			providerId,
			productId,
			images: imageIds.map((id, idx) => {
				const row = existingById.get(id)!
				return { id, url: String((row as any).url), isPrimary: idx === 0 }
			}),
		})
	} catch (e) {
		console.log(JSON.stringify({ action: "product_images_set", ok: false, error: String(e) }))
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
