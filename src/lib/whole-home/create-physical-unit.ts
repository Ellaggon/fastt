import {
	db,
	eq,
	first,
	InventoryResource,
	Product,
	Variant,
	WholeHome,
	WholeHomeUnit,
} from "@/shared/infrastructure/db/compat"
import { assertWholeHomeUnitContract } from "./unit-contract"

/** Internal aggregate command; public creation remains gated until quote/booking certify. */
export async function createWholeHomePhysicalUnit(params: {
	providerId: string
	productId: string
	variantId: string
	resourceId: string
	physicalKey: string
}) {
	const physicalKey = params.physicalKey.trim()
	if (!physicalKey) throw new Error("WHOLE_HOME_PHYSICAL_KEY_REQUIRED")
	return db.transaction(async (tx) => {
		const product = await tx
			.select({ id: Product.id, providerId: Product.providerId, productType: Product.productType })
			.from(Product)
			.where(eq(Product.id, params.productId))
			.then(first)
		const home = await tx
			.select({ exclusiveUse: WholeHome.exclusiveUse })
			.from(WholeHome)
			.where(eq(WholeHome.productId, params.productId))
			.then(first)
		const variant = await tx
			.select({ id: Variant.id, kind: Variant.kind, productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, params.variantId))
			.then(first)
		const resource = await tx
			.select({
				id: InventoryResource.id,
				variantId: InventoryResource.variantId,
				providerId: InventoryResource.providerId,
			})
			.from(InventoryResource)
			.where(eq(InventoryResource.id, params.resourceId))
			.then(first)
		if (!product || !home || !variant || !resource || product.providerId !== params.providerId) {
			throw new Error("WHOLE_HOME_AGGREGATE_NOT_FOUND")
		}
		assertWholeHomeUnitContract({
			productId: product.id,
			productType: product.productType,
			providerId: params.providerId,
			variantId: variant.id,
			variantKind: String(variant.kind ?? ""),
			variantProductId: variant.productId,
			resourceId: resource.id,
			resourceVariantId: resource.variantId,
			resourceProviderId: resource.providerId,
			unitCount: 1,
			exclusiveUse: home.exclusiveUse,
		})
		await tx.insert(WholeHomeUnit).values({
			variantId: params.variantId,
			productId: params.productId,
			providerId: params.providerId,
			resourceId: params.resourceId,
			physicalKey,
			unitCount: 1,
		})
		return { variantId: params.variantId, resourceId: params.resourceId }
	})
}
