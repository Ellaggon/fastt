import { db, eq, inArray, and, Service, ProductService, ProductServiceAttribute } from "astro:db"
import type { ProductServiceRepositoryPort } from "../../application/ports/ProductServiceRepositoryPort"

export class ProductServiceRepository implements ProductServiceRepositoryPort {
	async syncProductServices(params: { productId: string; services: { serviceId: string }[] }) {
		const { productId, services } = params

		await db.transaction(async (tx) => {
			const requestedIds = services.map((s) => s.serviceId)

			if (requestedIds.length === 0) {
				await tx.delete(ProductService).where(eq(ProductService.productId, productId))
				return
			}

			const validServices = await tx
				.select({ id: Service.id })
				.from(Service)
				.where(inArray(Service.id, requestedIds))
				.all()

			const validIds = new Set(validServices.map((s) => s.id))

			const existing = await tx
				.select({ serviceId: ProductService.serviceId })
				.from(ProductService)
				.where(eq(ProductService.productId, productId))
				.all()

			const existingIds = new Set(existing.map((s) => s.serviceId))

			for (const serviceId of validIds) {
				if (!existingIds.has(serviceId)) {
					await tx.insert(ProductService).values({
						id: crypto.randomUUID(),
						productId,
						serviceId,
					})
				}
			}

			const toDelete = [...existingIds].filter((id) => !validIds.has(id))

			if (toDelete.length > 0) {
				await tx
					.delete(ProductService)
					.where(
						and(
							eq(ProductService.productId, productId),
							inArray(ProductService.serviceId, toDelete)
						)
					)
			}
		})
	}

	async ensureProductService(params: { productId: string; serviceId: string; appliesTo?: string }) {
		const existing = await db
			.select({ id: ProductService.id })
			.from(ProductService)
			.where(
				and(
					eq(ProductService.productId, params.productId),
					eq(ProductService.serviceId, params.serviceId)
				)
			)
			.get()

		if (existing) return existing.id

		const created = await db
			.insert(ProductService)
			.values({
				id: crypto.randomUUID(),
				productId: params.productId,
				serviceId: params.serviceId,
				appliesTo: params.appliesTo ?? "both",
			})
			.returning()
			.get()

		return created.id
	}

	async updateProductService(params: {
		psId: string
		price: number | null
		priceUnit: string | null
		currency: string | null
		appliesTo: string
		notes: string | undefined
		attributes: { key: string; value: string }[]
	}) {
		await db.transaction(async (tx) => {
			await tx
				.update(ProductService)
				.set({
					price: params.price,
					priceUnit: params.priceUnit,
					currency: params.currency,
					appliesTo: params.appliesTo,
					notes: params.notes,
				})
				.where(eq(ProductService.id, params.psId))

			await tx
				.delete(ProductServiceAttribute)
				.where(eq(ProductServiceAttribute.productServiceId, params.psId))

			if (params.attributes.length > 0) {
				await tx.insert(ProductServiceAttribute).values(
					params.attributes.map((a) => ({
						id: crypto.randomUUID(),
						productServiceId: params.psId,
						key: a.key,
						value: a.value,
					}))
				)
			}
		})
	}

	async deleteProductService(params: { productId: string; serviceId: string }) {
		await db.transaction(async (tx) => {
			const ps = await tx
				.select({ id: ProductService.id })
				.from(ProductService)
				.where(
					and(
						eq(ProductService.productId, params.productId),
						eq(ProductService.serviceId, params.serviceId)
					)
				)
				.get()

			if (!ps) return

			await tx
				.delete(ProductServiceAttribute)
				.where(eq(ProductServiceAttribute.productServiceId, ps.id))

			await tx.delete(ProductService).where(eq(ProductService.id, ps.id))
		})
	}
}
