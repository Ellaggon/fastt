// src/pages/api/products/images/update.ts
import type { APIRoute } from "astro"
import { z } from "zod"
import { productRepository, productImageRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProductImages } from "@/modules/catalog/public"

const schema = z.object({
	productId: z.string().min(1),
	images: z
		.array(
			z.object({
				id: z.string().optional(),
				url: z.string().url(),
				isPrimary: z.boolean().optional(),
			})
		)
		.min(0),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}

		const body = await request.json()
		const parsed = schema.safeParse(body)
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}

		const { productId, images } = parsed.data
		return updateProductImages({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			repo: productImageRepository,
			providerId,
			productId,
			images,
		})
	} catch (err) {
		console.error("images update error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
