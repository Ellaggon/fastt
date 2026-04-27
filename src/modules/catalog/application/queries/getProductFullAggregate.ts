import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import type {
	CatalogReadModelRepositoryPort,
	ProductFullAggregate,
	ProductVariantsAggregate,
	VariantFullAggregate,
} from "../ports/CatalogReadModelRepositoryPort"

export type { ProductFullAggregate, ProductVariantsAggregate, VariantFullAggregate }

export function createGetProductFullAggregateQuery(deps: { repo: CatalogReadModelRepositoryPort }) {
	return async function getProductFullAggregate(
		productId: string,
		providerId: string
	): Promise<ProductFullAggregate | null> {
		if (!productId || !providerId) return null
		return readThrough(cacheKeys.productSurface(productId), cacheTtls.productSurface, async () =>
			deps.repo.getProductFullAggregate(productId, providerId)
		)
	}
}

export function createGetProductVariantsAggregateQuery(deps: {
	repo: CatalogReadModelRepositoryPort
}) {
	return async function getProductVariantsAggregate(
		productId: string,
		providerId: string
	): Promise<ProductVariantsAggregate | null> {
		if (!productId || !providerId) return null
		return readThrough(
			cacheKeys.productVariantsList(productId),
			cacheTtls.productVariantsList,
			async () => deps.repo.getProductVariantsAggregate(productId, providerId)
		)
	}
}

export function createGetVariantFullAggregateQuery(deps: { repo: CatalogReadModelRepositoryPort }) {
	return async function getVariantFullAggregate(
		productId: string,
		variantId: string,
		providerId: string
	): Promise<VariantFullAggregate | null> {
		if (!productId || !variantId || !providerId) return null
		return readThrough(cacheKeys.variantDetail(variantId), cacheTtls.variantDetail, async () =>
			deps.repo.getVariantFullAggregate(productId, variantId, providerId)
		)
	}
}
