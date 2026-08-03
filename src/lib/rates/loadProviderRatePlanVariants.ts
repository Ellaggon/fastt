import { asc, db, eq, Product, Variant } from "@/shared/infrastructure/db/compat"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"

export type ProviderRatePlanVariantChoice = {
	variantId: string
	variantName: string
	productId: string
	productName: string
	label: string
}

export async function loadProviderRatePlanVariants(
	providerId: string
): Promise<ProviderRatePlanVariantChoice[]> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return []

	return readThrough(
		cacheKeys.providerRatePlanVariants(normalizedProviderId),
		cacheTtls.providerRatePlanVariants,
		() => queryProviderRatePlanVariants(normalizedProviderId)
	)
}

async function queryProviderRatePlanVariants(
	providerId: string
): Promise<ProviderRatePlanVariantChoice[]> {
	const rows = await db
		.select({
			variantId: Variant.id,
			variantName: Variant.name,
			productId: Product.id,
			productName: Product.name,
		})
		.from(Variant)
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(eq(Product.providerId, providerId))
		.orderBy(asc(Product.name), asc(Variant.name))

	return rows.map((row) => ({
		variantId: String(row.variantId),
		variantName: String(row.variantName ?? "Habitación"),
		productId: String(row.productId),
		productName: String(row.productName ?? "Hotel"),
		label: `${String(row.productName ?? "Hotel")} · ${String(row.variantName ?? "Habitación")}`,
	}))
}
