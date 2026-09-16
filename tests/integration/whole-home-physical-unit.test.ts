import { describe, expect, it } from "vitest"
import { createWholeHomePhysicalUnit } from "@/lib/whole-home/create-physical-unit"
import { db, eq, InventoryResource, Product, Provider, Variant, WholeHome, WholeHomeUnit } from "@/shared/infrastructure/db/compat"

describe("whole-home physical identity in PostgreSQL", () => {
	it("binds one unit to one resource and refuses duplicate physical dwellings", async () => {
		const run = crypto.randomUUID()
		const providerId = `whole-home-provider-${run}`
		const productIds = [`whole-home-product-a-${run}`, `whole-home-product-b-${run}`]
		const variantIds = [`whole-home-variant-a-${run}`, `whole-home-variant-b-${run}`]
		const resourceIds = [`whole-home-resource-a-${run}`, `whole-home-resource-b-${run}`]
		await db.insert(Provider).values({ id: providerId, displayName: `Physical Test ${run}`, accountPurpose: "integration_certification", dataClassification: "fixture" })
		try {
			for (let i = 0; i < 2; i++) {
				await db.insert(Product).values({ id: productIds[i], providerId, name: `Home ${i}`, productType: "whole_home", dataClass: "fixture" })
				await db.insert(WholeHome).values({ productId: productIds[i], exclusiveUse: true, bedrooms: 2, beds: 3, bathrooms: 1, maxGuests: 4 })
				await db.insert(Variant).values({ id: variantIds[i], productId: productIds[i], name: "Entire place", kind: "whole_home" })
				await db.insert(InventoryResource).values({ id: resourceIds[i], providerId, variantId: variantIds[i], label: `Dwelling ${i}` })
			}
			await expect(createWholeHomePhysicalUnit({ providerId, productId: productIds[0], variantId: variantIds[0], resourceId: resourceIds[0], physicalKey: "dwelling-a" })).resolves.toMatchObject({ resourceId: resourceIds[0] })
			await expect(createWholeHomePhysicalUnit({ providerId, productId: productIds[1], variantId: variantIds[1], resourceId: resourceIds[1], physicalKey: "dwelling-a" })).rejects.toThrow()
			const units = await db.select().from(WholeHomeUnit).where(eq(WholeHomeUnit.providerId, providerId))
			expect(units).toHaveLength(1)
			expect(units[0]).toMatchObject({ productId: productIds[0], unitCount: 1 })
		} finally {
			for (const variantId of variantIds) await db.delete(WholeHomeUnit).where(eq(WholeHomeUnit.variantId, variantId))
			for (const resourceId of resourceIds) await db.delete(InventoryResource).where(eq(InventoryResource.id, resourceId))
			for (const variantId of variantIds) await db.delete(Variant).where(eq(Variant.id, variantId))
			for (const productId of productIds) await db.delete(WholeHome).where(eq(WholeHome.productId, productId))
			for (const productId of productIds) await db.delete(Product).where(eq(Product.id, productId))
			await db.delete(Provider).where(eq(Provider.id, providerId))
		}
	})
})
