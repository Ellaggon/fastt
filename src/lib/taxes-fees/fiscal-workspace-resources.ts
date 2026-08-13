import { variantManagementRepository } from "@/container"
import { getAggregateCache, setAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { listRatePlansByProvider } from "@/modules/pricing/public"
import { db, eq, Product } from "@/shared/infrastructure/db/compat"

export type FiscalWorkspaceResources = {
	providerId: string
	products: Array<{ id: string; label: string; kind: string }>
	variants: Array<{ id: string; productId: string; label: string; kind: string }>
	ratePlans: Array<{
		id: string
		productId: string
		variantId: string
		label: string
		isActive: boolean
	}>
}

/** Short-lived workspace catalog shared by Definitions and Simulator route transitions. */
export async function getFiscalWorkspaceResources(
	providerId: string
): Promise<FiscalWorkspaceResources> {
	const cacheKey = `fiscal:resources:${providerId}`
	const cached = getAggregateCache<FiscalWorkspaceResources>(cacheKey)
	if (cached) return cached

	const [productRows, ratePlans] = await Promise.all([
		db
			.select({ id: Product.id, name: Product.name, productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, providerId))
			.catch(() => []),
		listRatePlansByProvider(providerId).catch(() => []),
	])
	const variantsByProduct = await Promise.all(
		productRows.map(async (product) => ({
			productId: String(product.id),
			variants: await variantManagementRepository
				.listVariantsByProductId(String(product.id))
				.catch(() => []),
		}))
	)
	const resources: FiscalWorkspaceResources = {
		providerId,
		products: productRows.map((product) => ({
			id: String(product.id),
			label: String(product.name || "Producto sin nombre"),
			kind: String(product.productType || "Producto"),
		})),
		variants: variantsByProduct.flatMap(({ productId, variants }) =>
			variants.map((variant) => ({
				id: String(variant.id),
				productId,
				label: String(variant.name || "Unidad sin nombre"),
				kind: String(variant.kind || "Unidad"),
			}))
		),
		ratePlans: (ratePlans as Array<any>).map((ratePlan) => ({
			id: String(ratePlan.ratePlanId),
			productId: String(ratePlan.productId),
			variantId: String(ratePlan.variantId),
			label: String(ratePlan.ratePlanName || "Tarifa sin nombre"),
			isActive: Boolean(ratePlan.isActive),
		})),
	}
	setAggregateCache(cacheKey, resources, {
		ttlMs: 5_000,
		tags: [
			`provider:${providerId}`,
			...resources.products.map((product) => `product:${product.id}`),
			...resources.variants.map((variant) => `variant:${variant.id}`),
		],
	})
	return resources
}
