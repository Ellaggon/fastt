import { describe, expect, it, vi } from "vitest"
import {
	db,
	DailyInventory,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	Hotel,
	HouseRule,
	Image,
	ImageUpload,
	Product,
	ProductContent,
	ProductLocation,
	ProductStatus,
	RatePlan,
	RatePlanOccupancyPolicy,
	SearchUnitView,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
	VariantReadiness,
	VariantRoomBed,
	VariantRoomProfile,
	eq,
} from "astro:db"

import { productRepository, r2 } from "@/container"
import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

async function rowsFor(table: any, column: any, value: string) {
	return db.select().from(table).where(eq(column, value)).all()
}

describe("integration/catalog delete product cascade", () => {
	it("deletes accommodation-owned rows, image upload records, effective pricing and R2 objects", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const previousSend = r2.send.bind(r2)
		const sendSpy = vi.fn(async (command: unknown) => {
			void command
			return {}
		})
		;(r2 as any).send = sendSpy

		const suffix = crypto.randomUUID()
		const providerId = `prov_delete_${suffix}`
		const destinationId = `dest_delete_${suffix}`
		const productId = `prod_delete_${suffix}`
		const variantId = `variant_delete_${suffix}`
		const ratePlanId = `rate_delete_${suffix}`
		const productImageId = `img_product_${suffix}`
		const variantImageId = `img_variant_${suffix}`
		const pendingImageId = `img_pending_${suffix}`

		try {
			await upsertDestination({
				id: destinationId,
				name: "Delete Cascade Destination",
				type: "city",
				country: "BO",
				slug: `delete-cascade-${suffix}`,
			})
			await upsertProvider({
				id: providerId,
				displayName: "Delete Cascade Provider",
				ownerEmail: `delete-${suffix}@example.com`,
			})

			await db.insert(Product).values({
				id: productId,
				name: "Delete Cascade Hotel",
				productType: "Hotel",
				providerId,
				destinationId,
			})
			await db.insert(ProductContent).values({
				productId,
				description: "Temporary hotel",
				highlightsJson: ["temporary"],
			})
			await db.insert(ProductLocation).values({
				productId,
				address: "Temporary address",
				lat: -17.7,
				lng: -63.1,
			})
			await db.insert(ProductStatus).values({ productId, state: "draft" })
			await db.insert(Hotel).values({ productId, stars: 3 })
			await db.insert(HouseRule).values({
				id: `rule_${suffix}`,
				productId,
				type: "Smoking",
				payloadJson: { allowed: false },
			})

			await db.insert(Image).values([
				{
					id: productImageId,
					entityType: "product",
					entityId: productId,
					objectKey: `products/${productId}/cover.png`,
					url: `https://cdn.test/products/${productId}/cover.png`,
					order: 0,
					isPrimary: true,
				},
				{
					id: variantImageId,
					entityType: "variant",
					entityId: variantId,
					objectKey: `products/${productId}/rooms/${variantId}.png`,
					url: `https://cdn.test/products/${productId}/rooms/${variantId}.png`,
					order: 0,
					isPrimary: true,
				},
				{
					id: pendingImageId,
					entityType: "pending",
					entityId: pendingImageId,
					objectKey: `products/${productId}/pending.png`,
					url: `https://cdn.test/products/${productId}/pending.png`,
					order: 0,
					isPrimary: false,
				},
			])
			await db.insert(ImageUpload).values([
				{
					id: productImageId,
					imageId: productImageId,
					objectKey: `products/${productId}/cover.png`,
					status: "completed",
					createdAt: new Date(),
					completedAt: new Date(),
				},
				{
					id: variantImageId,
					imageId: variantImageId,
					objectKey: `products/${productId}/rooms/${variantId}.png`,
					status: "completed",
					createdAt: new Date(),
					completedAt: new Date(),
				},
				{
					id: pendingImageId,
					imageId: pendingImageId,
					objectKey: `products/${productId}/pending.png`,
					status: "pending",
					createdAt: new Date(),
					completedAt: null,
				},
			])

			await db.insert(Variant).values({
				id: variantId,
				productId,
				name: "Suite temporal",
				kind: "hotel_room",
				status: "ready",
				isActive: true,
			})
			await db.insert(VariantCapacity).values({
				variantId,
				minOccupancy: 1,
				maxOccupancy: 2,
				maxAdults: 2,
				maxChildren: 0,
			})
			await db.insert(VariantRoomProfile).values({
				variantId,
				sizeM2: 25,
				bathroomCount: 1,
				bathroomType: "private",
			})
			await db.insert(VariantRoomBed).values({
				id: `bed_${suffix}`,
				variantId,
				bedType: "queen",
				count: 1,
				sortOrder: 0,
			})
			await db.insert(VariantReadiness).values({
				variantId,
				state: "ready",
				validationErrorsJson: [],
			})
			await db.insert(VariantInventoryConfig).values({
				variantId,
				defaultTotalUnits: 1,
				horizonDays: 30,
				createdAt: new Date(),
			})
			await db.insert(DailyInventory).values({
				id: `inventory_${suffix}`,
				variantId,
				date: "2026-08-01",
				totalInventory: 1,
				reservedCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			await db.insert(EffectiveAvailability).values({
				id: `availability_${suffix}`,
				variantId,
				date: "2026-08-01",
				totalUnits: 1,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: 1,
				computedAt: new Date(),
			})
			await db.insert(RatePlan).values({
				id: ratePlanId,
				variantId,
				name: "Tarifa temporal",
				isDefault: true,
				isActive: true,
			})
			await db.insert(RatePlanOccupancyPolicy).values({
				id: `occupancy_${suffix}`,
				ratePlanId,
				baseAmount: 100,
				baseCurrency: "BOB",
				baseAdults: 2,
				baseChildren: 0,
				extraAdultMode: "fixed",
				extraAdultValue: 0,
				childMode: "fixed",
				childValue: 0,
				currency: "BOB",
				effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
				effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
				createdAt: new Date(),
			})
			await db.insert(EffectiveRestriction).values({
				id: `restriction_${suffix}`,
				variantId,
				ratePlanId,
				date: "2026-08-01",
				minStay: 1,
				cta: false,
				ctd: false,
				stopSell: false,
				priority: 0,
				computedAt: new Date(),
			})
			await db.insert(EffectivePricingV2).values({
				id: `pricing_${suffix}`,
				variantId,
				ratePlanId,
				date: "2026-08-01",
				occupancyKey: "2A0C",
				baseComponent: 100,
				occupancyAdjustment: 0,
				ruleAdjustment: 0,
				finalBasePrice: 100,
				currency: "BOB",
				computedAt: new Date(),
				sourceVersion: "test",
			})
			await db.insert(SearchUnitView).values({
				id: `search_${suffix}`,
				variantId,
				productId,
				ratePlanId,
				date: "2026-08-01",
				occupancyKey: "2A0C",
				totalGuests: 2,
				hasAvailability: true,
				hasPrice: true,
				isAvailable: true,
				availableUnits: 1,
				pricePerNight: 100,
				currency: "BOB",
				cta: false,
				ctd: false,
				computedAt: new Date(),
				sourceVersion: "test",
			})

			await productRepository.deleteProductCascade(productId)

			await expect(rowsFor(Product, Product.id, productId)).resolves.toHaveLength(0)
			await expect(
				rowsFor(ProductContent, ProductContent.productId, productId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(ProductLocation, ProductLocation.productId, productId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(ProductStatus, ProductStatus.productId, productId)
			).resolves.toHaveLength(0)
			await expect(rowsFor(Hotel, Hotel.productId, productId)).resolves.toHaveLength(0)
			await expect(rowsFor(HouseRule, HouseRule.productId, productId)).resolves.toHaveLength(0)
			await expect(rowsFor(Variant, Variant.id, variantId)).resolves.toHaveLength(0)
			await expect(rowsFor(RatePlan, RatePlan.id, ratePlanId)).resolves.toHaveLength(0)
			await expect(
				rowsFor(EffectivePricingV2, EffectivePricingV2.ratePlanId, ratePlanId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(SearchUnitView, SearchUnitView.productId, productId)
			).resolves.toHaveLength(0)
			await expect(rowsFor(Image, Image.id, productImageId)).resolves.toHaveLength(0)
			await expect(rowsFor(Image, Image.id, variantImageId)).resolves.toHaveLength(0)
			await expect(rowsFor(Image, Image.id, pendingImageId)).resolves.toHaveLength(0)
			await expect(rowsFor(ImageUpload, ImageUpload.imageId, productImageId)).resolves.toHaveLength(
				0
			)
			await expect(rowsFor(ImageUpload, ImageUpload.imageId, variantImageId)).resolves.toHaveLength(
				0
			)
			await expect(rowsFor(ImageUpload, ImageUpload.imageId, pendingImageId)).resolves.toHaveLength(
				0
			)

			const deletedKeys = sendSpy.mock.calls
				.map(([command]) => (command as any)?.input?.Key)
				.filter(Boolean)
			expect(deletedKeys).toEqual(
				expect.arrayContaining([
					`products/${productId}/cover.png`,
					`products/${productId}/rooms/${variantId}.png`,
					`products/${productId}/pending.png`,
				])
			)
		} finally {
			;(r2 as any).send = previousSend
		}
	})
})
