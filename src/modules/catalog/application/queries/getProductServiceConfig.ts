import type {
	ProductServiceAttributeRow,
	ProductServiceConfigRow,
	ProductServiceQueryRepositoryPort,
} from "../ports/ProductServiceQueryRepositoryPort"

export type ProductServiceConfigResult = {
	productService: ProductServiceConfigRow | null
	attributes: ProductServiceAttributeRow[]
}

export function createGetProductServiceConfigQuery(deps: {
	repo: ProductServiceQueryRepositoryPort
}) {
	return async function getProductServiceConfig(params: {
		productId: string
		serviceId: string
	}): Promise<ProductServiceConfigResult> {
		if (!params.productId || !params.serviceId) {
			return { productService: null, attributes: [] }
		}

		const productService = await deps.repo.getServiceConfig(params)
		if (!productService) return { productService: null, attributes: [] }

		const attributes = await deps.repo.listAttributesByProductServiceIds([
			productService.productServiceId,
		])
		return { productService, attributes }
	}
}
