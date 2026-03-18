import { db, eq, inArray, ProductService, ProductServiceAttribute, Service } from "astro:db"
import { SERVICE_CATALOG_BY_ID } from "@/data/service/service-catalog"

export async function resolveProductServices(productId: string) {
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
	).filter(
		(r): r is { serviceId: string; productServiceId: string } =>
			r.serviceId !== null
	)

	if (!rows.length) return []

	const productServiceIds = rows.map((r) => r.productServiceId)

	const attributes = await db
		.select()
		.from(ProductServiceAttribute)
		.where(inArray(ProductServiceAttribute.productServiceId, productServiceIds))
		.all()

	const serviceIdByPsId = new Map(
		rows.map((r) => [r.productServiceId, r.serviceId])
	)

	const attributesByService: Record<string, Record<string, string>> = {}

	for (const attr of attributes) {
		const serviceId = serviceIdByPsId.get(attr.productServiceId)
		if (!serviceId) continue

		attributesByService[serviceId] ??= {}
		attributesByService[serviceId][attr.key] = attr.value
	}

	return rows
		.map((r) => {
			const def = SERVICE_CATALOG_BY_ID[r.serviceId]
			if (!def) return null

			return {
				...def,
				attributes: attributesByService[r.serviceId] ?? {},
			}
		})
		.filter(Boolean)
}