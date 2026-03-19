import { and, db, eq, ProductService, ProductServiceAttribute } from "astro:db"

export async function deleteProductService(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	providerId: string
	productId: string
	serviceId: string
}): Promise<Response> {
	const { ensureOwned, providerId, productId, serviceId } = params

	const product = await ensureOwned(productId, providerId)
	if (!product) {
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
