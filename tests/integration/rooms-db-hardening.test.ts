import { describe, expect, it } from "vitest"
import {
	AmenityRoom,
	db,
	Hotel,
	RoomType,
	VariantRoomAmenity,
	VariantRoomBed,
	VariantRoomProfile,
	eq,
} from "astro:db"

import { HotelAmenityQueryRepository } from "@/modules/catalog/infrastructure/repositories/HotelAmenityQueryRepository"
import { VariantRoomProfileRepository } from "@/modules/catalog/infrastructure/repositories/VariantRoomProfileRepository"
import { seedTestProductVariant } from "@/shared/infrastructure/test-support/db-test-data"

describe("rooms db hardening", () => {
	it("reads room profile and beds from rooms v2 tables", async () => {
		const variantId = `variant_room_${crypto.randomUUID()}`
		await seedTestProductVariant({
			destinationId: `dest_${variantId}`,
			productId: `product_${variantId}`,
			variantId,
		})
		await db.insert(Hotel).values({ productId: `product_${variantId}` })
		await db.insert(RoomType).values({
			id: `suite_${variantId}`,
			name: "Suite",
			maxOccupancy: 3,
			description: "Suite test",
		})
		await db.insert(VariantRoomProfile).values({
			variantId,
			roomTypeId: `suite_${variantId}`,
			totalRooms: 4,
			viewType: "mar",
			sizeM2: 32,
			bathroomCount: 1,
			bathroomType: "private",
			hasBalcony: true,
			maxOccupancyOverride: 3,
			guestFacingNotes: "Vista al mar",
		})
		await db.insert(VariantRoomBed).values({
			id: `${variantId}:bed:queen`,
			variantId,
			bedType: "queen",
			count: 1,
			sortOrder: 0,
		})

		const repo = new VariantRoomProfileRepository()
		const rows = await repo.getByIds([variantId])

		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			id: variantId,
			variantId,
			roomTypeName: "Suite",
			totalRooms: 4,
			viewType: "mar",
			sizeM2: 32,
			bathroomCount: 1,
			bathroomType: "private",
			hasBalcony: true,
			maxOccupancy: 3,
			guestFacingNotes: "Vista al mar",
		})
		expect((rows[0] as any).beds).toEqual([{ id: "queen", count: 1 }])

		const profile = await db
			.select()
			.from(VariantRoomProfile)
			.where(eq(VariantRoomProfile.variantId, variantId))
			.get()
		const beds = await db
			.select()
			.from(VariantRoomBed)
			.where(eq(VariantRoomBed.variantId, variantId))
			.all()

		expect(profile?.variantId).toBe(variantId)
		expect(beds).toHaveLength(1)
		expect(beds[0].bedType).toBe("queen")
	})

	it("reads room amenities from rooms v2 tables", async () => {
		const variantId = `variant_amenity_${crypto.randomUUID()}`
		const amenityId = `amenity_${variantId}`
		await seedTestProductVariant({
			destinationId: `dest_${variantId}`,
			productId: `product_${variantId}`,
			variantId,
		})
		await db.insert(Hotel).values({ productId: `product_${variantId}` })
		await db.insert(RoomType).values({
			id: `double_${variantId}`,
			name: "Doble",
			maxOccupancy: 2,
			description: "Doble test",
		})
		await db.insert(AmenityRoom).values({
			id: amenityId,
			name: "Baño privado",
			category: "Baño",
		})
		await db.insert(VariantRoomProfile).values({
			variantId,
			roomTypeId: `double_${variantId}`,
			totalRooms: 2,
		})
		await db.insert(VariantRoomAmenity).values({
			id: `${variantId}:amenity:${amenityId}`,
			variantId,
			amenityId,
			isAvailable: true,
		})

		const roomRepo = new VariantRoomProfileRepository()
		await roomRepo.getByIds([variantId])

		const amenityRepo = new HotelAmenityQueryRepository()
		const rows = await amenityRepo.listByRoomTypeIds([variantId])

		expect(rows).toEqual([
			expect.objectContaining({
				roomId: variantId,
				amenityId,
				amenityName: "Baño privado",
				category: "Baño",
				isAvailable: true,
			}),
		])

		const persisted = await db
			.select()
			.from(VariantRoomAmenity)
			.where(eq(VariantRoomAmenity.variantId, variantId))
			.all()
		expect(persisted).toHaveLength(1)
		expect(persisted[0].amenityId).toBe(amenityId)
	})
})
