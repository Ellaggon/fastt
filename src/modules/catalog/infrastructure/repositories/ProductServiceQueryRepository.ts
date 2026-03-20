import { db, eq, inArray, ProductService, ProductServiceAttribute, Service } from "astro:db"
import type {
	ProductServiceQueryRepositoryPort,
	ProductServiceLinkRow,
	ProductServiceAttributeRow,
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
