import { db, eq, inArray, and, ProductService, ProductServiceAttribute, Service } from "astro:db"
import type {
	ProductServiceQueryRepositoryPort,
	ProductServiceLinkRow,
	ProductServiceAttributeRow,
	ProductServiceConfigRow,
} from "../../application/ports/ProductServiceQueryRepositoryPort"

export class ProductServiceQueryRepository implements ProductServiceQueryRepositoryPort {
	async listServiceLinks(productId: string): Promise<ProductServiceLinkRow[]> {
		const rows = (
			await db
				.select({
					serviceId: Service.id,
					productServiceId: ProductService.id,
				})
				.from(ProductService)
				.leftJoin(Service, eq(ProductService.serviceId, Service.id))
				.where(eq(ProductService.productId, productId))
				.all()
		).filter((r): r is { serviceId: string; productServiceId: string } => r.serviceId !== null)

		return rows
	}

	async listServiceConfigs(productId: string): Promise<ProductServiceConfigRow[]> {
		const rows = await db
			.select({
				serviceId: ProductService.serviceId,
				productServiceId: ProductService.id,
				price: ProductService.price,
				priceUnit: ProductService.priceUnit,
				currency: ProductService.currency,
				appliesTo: ProductService.appliesTo,
				notes: ProductService.notes,
			})
			.from(ProductService)
			.where(eq(ProductService.productId, productId))
			.all()

		return rows as unknown as ProductServiceConfigRow[]
	}

	async getServiceConfig(params: {
		productId: string
		serviceId: string
	}): Promise<ProductServiceConfigRow | null> {
		const row = await db
			.select({
				serviceId: ProductService.serviceId,
				productServiceId: ProductService.id,
				price: ProductService.price,
				priceUnit: ProductService.priceUnit,
				currency: ProductService.currency,
				appliesTo: ProductService.appliesTo,
				notes: ProductService.notes,
			})
			.from(ProductService)
			.where(
				and(
					eq(ProductService.productId, params.productId),
					eq(ProductService.serviceId, params.serviceId)
				)
			)
			.get()

		// NOTE: preserve current behavior (null when not found)
		if (!row) return null
		return row as unknown as ProductServiceConfigRow
	}

	async listAttributesByProductServiceIds(
		productServiceIds: string[]
	): Promise<ProductServiceAttributeRow[]> {
		if (!productServiceIds.length) return []

		return (await db
			.select()
			.from(ProductServiceAttribute)
			.where(inArray(ProductServiceAttribute.productServiceId, productServiceIds))
			.all()) as unknown as ProductServiceAttributeRow[]
	}
}
