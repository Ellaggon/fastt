import { db, eq, inArray, and, Service, ProductService } from "astro:db"

export async function syncProductServices(params: {
	ensureOwned: (productId: string, providerId: string) => Promise<any>
	providerId: string
	productId: string
	services: { serviceId: string }[]
}): Promise<Response> {
	const { ensureOwned, providerId, productId, services } = params

	const product = await ensureOwned(productId, providerId)
	if (!product) {
		return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
	}

	await db.transaction(async (tx) => {
		// ─── IDs enviados desde la UI ─────────────────────
		const requestedIds = services.map((s) => s.serviceId)

		if (requestedIds.length === 0) {
			// Si no viene ninguno → eliminar todos
			await tx.delete(ProductService).where(eq(ProductService.productId, productId))
			return
		}

		// ─── Validar contra Service ───────────────────────
		const validServices = await tx
			.select({ id: Service.id })
			.from(Service)
			.where(inArray(Service.id, requestedIds))
			.all()

		const validIds = new Set(validServices.map((s) => s.id))

		// ─── Servicios actuales del producto ──────────────
		const existing = await tx
			.select({
				serviceId: ProductService.serviceId,
			})
			.from(ProductService)
			.where(eq(ProductService.productId, productId))
			.all()

		const existingIds = new Set(existing.map((s) => s.serviceId))

		// ─── INSERTAR (válidos que no existen) ────────────
		for (const serviceId of validIds) {
			if (!existingIds.has(serviceId)) {
				await tx.insert(ProductService).values({
					id: crypto.randomUUID(),
					productId,
					serviceId,
				})
			}
		}

		// ─── ELIMINAR (existentes que ya no vienen) ───────
		const toDelete = [...existingIds].filter((id) => !validIds.has(id))

		if (toDelete.length > 0) {
			await tx
				.delete(ProductService)
				.where(
					and(eq(ProductService.productId, productId), inArray(ProductService.serviceId, toDelete))
				)
		}
	})

	return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
