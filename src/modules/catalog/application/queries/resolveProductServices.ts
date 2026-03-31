import type { ProductServiceQueryRepositoryPort } from "../ports/ProductServiceQueryRepositoryPort"

export function createResolveProductServicesQuery(deps: {
	repo: ProductServiceQueryRepositoryPort
}) {
	return async function resolveProductServices(productId: string) {
		const { SERVICE_CATALOG_BY_ID } = await import("@/data/service/service-catalog")
		const rows = await deps.repo.listServiceLinks(productId)

		if (!rows.length) return []

		const productServiceIds = rows.map((r) => r.productServiceId)

		const attributes = await deps.repo.listAttributesByProductServiceIds(productServiceIds)

		const serviceIdByPsId = new Map(rows.map((r) => [r.productServiceId, r.serviceId]))

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
}
