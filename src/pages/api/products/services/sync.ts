import type { APIRoute } from "astro"
import { z } from "astro:content"
import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { syncProductServices } from "@/modules/catalog/application/use-cases/sync-product-services"

const schema = z.object({
	productId: z.string().min(1),
	services: z.array(
		z.object({
			serviceId: z.string().min(1),
		})
	),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}

		const parsed = schema.safeParse(await request.json())
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 })
		}

		const { productId, services } = parsed.data
		return syncProductServices({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			providerId,
			productId,
			services,
		})
	} catch (err) {
		console.error("update-services error", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
