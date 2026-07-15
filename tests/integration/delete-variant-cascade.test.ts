import { describe, expect, it, vi } from "vitest"
import {
	db,
	DailyInventory,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	Image,
	ImageUpload,
	InventoryLock,
	Product,
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

import { r2, variantManagementRepository } from "@/container"
import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

async function rowsFor(table: any, column: any, value: string) {
	return db.select().from(table).where(eq(column, value)).all()
}

async function seedProduct(params: { suffix: string; providerId: string; destinationId: string }) {
	const productId = `prod_room_delete_${params.suffix}`
	await upsertDestination({
		id: params.destinationId,
		name: "Delete Room Destination",
		type: "city",
		country: "BO",
		slug: `delete-room-${params.suffix}`,
	})
	await upsertProvider({
		id: params.providerId,
		displayName: "Delete Room Provider",
		ownerEmail: `delete-room-${params.suffix}@example.com`,
	})
	await db.insert(Product).values({
		id: productId,
		name: "Hotel con habitación temporal",
		productType: "Hotel",
		providerId: params.providerId,
		destinationId: params.destinationId,
	})
	return productId
}

async function seedSellableRoom(params: { productId: string; suffix: string }) {
	const variantId = `variant_room_delete_${params.suffix}`
	const ratePlanId = `rate_room_delete_${params.suffix}`
	const imageId = `img_room_delete_${params.suffix}`

	await db.insert(Variant).values({
		id: variantId,
		productId: params.productId,
		name: "Habitación temporal",
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
		sizeM2: 22,
		bathroomCount: 1,
		bathroomType: "private",
	})
	await db.insert(VariantRoomBed).values({
		id: `bed_room_delete_${params.suffix}`,
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
		id: `inventory_room_delete_${params.suffix}`,
		variantId,
		date: "2026-08-01",
		totalInventory: 1,
		reservedCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	await db.insert(EffectiveAvailability).values({
		id: `availability_room_delete_${params.suffix}`,
		variantId,
		date: "2026-08-01",
		totalUnits: 1,
		heldUnits: 0,
		bookedUnits: 0,
		availableUnits: 1,
		computedAt: new Date(),
	})
	await db.insert(Image).values({
		id: imageId,
		entityType: "variant",
		entityId: variantId,
		objectKey: `rooms/${variantId}/cover.png`,
		url: `https://cdn.test/rooms/${variantId}/cover.png`,
		order: 0,
		isPrimary: true,
	})
	await db.insert(ImageUpload).values({
		id: imageId,
		imageId,
		objectKey: `rooms/${variantId}/cover.png`,
		status: "completed",
		createdAt: new Date(),
		completedAt: new Date(),
	})
	await db.insert(RatePlan).values({
		id: ratePlanId,
		variantId,
		name: "Tarifa temporal",
		isDefault: true,
		isActive: true,
	})
	await db.insert(RatePlanOccupancyPolicy).values({
		id: `occupancy_room_delete_${params.suffix}`,
		ratePlanId,
		baseAmount: 120,
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
		id: `restriction_room_delete_${params.suffix}`,
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
		id: `pricing_room_delete_${params.suffix}`,
		variantId,
		ratePlanId,
		date: "2026-08-01",
		occupancyKey: "2A0C",
		baseComponent: 120,
		occupancyAdjustment: 0,
		ruleAdjustment: 0,
		finalBasePrice: 120,
		currency: "BOB",
		computedAt: new Date(),
		sourceVersion: "test",
	})
	await db.insert(SearchUnitView).values({
		id: `search_room_delete_${params.suffix}`,
		variantId,
		productId: params.productId,
		ratePlanId,
		date: "2026-08-01",
		occupancyKey: "2A0C",
		totalGuests: 2,
		hasAvailability: true,
		hasPrice: true,
		isAvailable: true,
		availableUnits: 1,
		pricePerNight: 120,
		currency: "BOB",
		cta: false,
		ctd: false,
		computedAt: new Date(),
		sourceVersion: "test",
	})

	return { variantId, ratePlanId, imageId }
}

describe("integration/catalog delete variant cascade", () => {
	it("deletes room-owned rows and R2 images without deleting the parent accommodation", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"
		const previousSend = r2.send.bind(r2)
		const sendSpy = vi.fn(async (command: unknown) => {
			void command
			return {}
		})
		;(r2 as any).send = sendSpy

		const suffix = crypto.randomUUID()
		const productId = await seedProduct({
			suffix,
			providerId: `prov_room_delete_${suffix}`,
			destinationId: `dest_room_delete_${suffix}`,
		})
		const { variantId, ratePlanId, imageId } = await seedSellableRoom({ productId, suffix })

		try {
			await variantManagementRepository.deleteVariantCascade(variantId)

			await expect(rowsFor(Product, Product.id, productId)).resolves.toHaveLength(1)
			await expect(rowsFor(Variant, Variant.id, variantId)).resolves.toHaveLength(0)
			await expect(
				rowsFor(VariantCapacity, VariantCapacity.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(VariantRoomProfile, VariantRoomProfile.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(VariantRoomBed, VariantRoomBed.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(VariantReadiness, VariantReadiness.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(VariantInventoryConfig, VariantInventoryConfig.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(DailyInventory, DailyInventory.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(EffectiveAvailability, EffectiveAvailability.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(EffectiveRestriction, EffectiveRestriction.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(EffectivePricingV2, EffectivePricingV2.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(
				rowsFor(SearchUnitView, SearchUnitView.variantId, variantId)
			).resolves.toHaveLength(0)
			await expect(rowsFor(RatePlan, RatePlan.id, ratePlanId)).resolves.toHaveLength(0)
			await expect(
				rowsFor(RatePlanOccupancyPolicy, RatePlanOccupancyPolicy.ratePlanId, ratePlanId)
			).resolves.toHaveLength(0)
			await expect(rowsFor(Image, Image.id, imageId)).resolves.toHaveLength(0)
			await expect(rowsFor(ImageUpload, ImageUpload.imageId, imageId)).resolves.toHaveLength(0)

			const deletedKeys = sendSpy.mock.calls
				.map(([command]) => (command as any)?.input?.Key)
				.filter(Boolean)
			expect(deletedKeys).toEqual(expect.arrayContaining([`rooms/${variantId}/cover.png`]))
		} finally {
			;(r2 as any).send = previousSend
		}
	})

	it("blocks hard delete when the room has inventory locks", async () => {
		const suffix = crypto.randomUUID()
		const productId = await seedProduct({
			suffix,
			providerId: `prov_room_delete_block_${suffix}`,
			destinationId: `dest_room_delete_block_${suffix}`,
		})
		const { variantId } = await seedSellableRoom({ productId, suffix })
		await db.insert(InventoryLock).values({
			id: `lock_room_delete_${suffix}`,
			holdId: `hold_room_delete_${suffix}`,
			variantId,
			date: "2026-08-01",
			quantity: 1,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
		})

		await expect(variantManagementRepository.deleteVariantCascade(variantId)).rejects.toThrow(
			"variant_has_transactions"
		)
		await expect(rowsFor(Variant, Variant.id, variantId)).resolves.toHaveLength(1)
	})
})
