import type { APIRoute } from "astro"
import { and, db, eq, ProductService, ProductServiceAttribute, Product } from "astro:db"
import { getSession } from "auth-astro/server"
import { getProviderIdFromRequest } from "@/lib/db/provider"

export const POST: APIRoute = async ({ request }) => {
	const session = await getSession(request)
	if (!session?.user?.email) {
		return new Response("Unauthorized", { status: 401 })
	}

	const { productId, serviceId } = await request.json()

	if (!productId || !serviceId) {
		return new Response("Missing identifiers", { status: 400 })
	}

	// 🔒 Verificar provider
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response("Provider not found", { status: 403 })
	}

	const product = await db
		.select({ id: Product.id, providerId: Product.providerId })
		.from(Product)
		.where(eq(Product.id, productId))
		.get()

	if (!product || String(product.providerId) !== String(providerId)) {
		return new Response("Forbidden", { status: 403 })
	}

	// 🧹 Borrado en cascada
	await db.transaction(async (tx) => {
		const ps = await tx
			.select({ id: ProductService.id })
			.from(ProductService)
			.where(and(eq(ProductService.productId, productId), eq(ProductService.serviceId, serviceId)))
			.get()

		if (!ps) return

		await tx
			.delete(ProductServiceAttribute)
			.where(eq(ProductServiceAttribute.productServiceId, ps.id))

		await tx.delete(ProductService).where(eq(ProductService.id, ps.id))
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
