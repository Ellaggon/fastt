import {
	db,
	HotelRoomType,
	Hotel,
	HotelRoomAmenity,
	Image,
	Variant,
	VariantCapacity,
	VariantHotelRoom,
	PricingBaseRate,
	RoomType,
	eq,
} from "astro:db"
import type {
	CreateHotelRoomParams,
	CreateHotelRoomResult,
	RoomRepositoryPort,
} from "../../application/ports/RoomRepositoryPort"

export class RoomRepository implements RoomRepositoryPort {
	async hotelExistsByProductId(hotelId: string): Promise<boolean> {
		const row = await db.select().from(Hotel).where(eq(Hotel.productId, hotelId)).get()
		return Boolean(row)
	}

	async createHotelRoom(params: CreateHotelRoomParams): Promise<CreateHotelRoomResult> {
		const hotelRoomId = crypto.randomUUID()
		const variantId = crypto.randomUUID()

		await db.transaction(async (tx) => {
			const roomType = await tx
				.select()
				.from(RoomType)
				.where(eq(RoomType.id, params.roomTypeId))
				.get()
			const inferredMax = (roomType as any)?.maxOccupancy
				? Number((roomType as any).maxOccupancy)
				: 1
			const maxOcc = params.maxOccupancyOverride ?? inferredMax

			await tx.insert(HotelRoomType).values({
				id: hotelRoomId,
				hotelId: params.hotelId,
				roomTypeId: params.roomTypeId,
				totalRooms: params.totalRooms,
				hasView: params.hasView,
				maxOccupancyOverride: params.maxOccupancyOverride,
				bedType: params.bedType,
				sizeM2: params.sizeM2,
				bathroom: params.bathroom,
				hasBalcony: params.hasBalcony,
			})

			await tx.insert(Variant).values({
				id: variantId,
				productId: params.hotelId,
				entityType: "hotel_room",
				entityId: hotelRoomId,
				name: params.variant.name,
				description: params.variant.description,
				kind: "hotel_room",
				status: "ready",
				createdAt: new Date(),
				currency: params.variant.currency,
				basePrice: params.variant.basePrice,
				isActive: true,
			})

			// CAPA 4A: dual-write base pricing into pricing_base_rate (new source of truth).
			await tx.insert(PricingBaseRate).values({
				variantId,
				currency: params.variant.currency,
				basePrice: params.variant.basePrice,
				createdAt: new Date(),
			} as any)

			// CAPA 3: subtype + capacity (new source of truth). Does not affect legacy flows.
			await tx.insert(VariantHotelRoom).values({
				variantId,
				roomTypeId: params.roomTypeId,
			})

			await tx.insert(VariantCapacity).values({
				variantId,
				minOccupancy: 1,
				maxOccupancy: maxOcc,
				maxAdults: maxOcc,
				maxChildren: 0,
			})

			if (params.amenityIds.length > 0) {
				await tx.insert(HotelRoomAmenity).values(
					params.amenityIds.map((amenityId) => ({
						id: crypto.randomUUID(),
						hotelRoomTypeId: hotelRoomId,
						amenityId,
						isAvailable: true,
					}))
				)
			}

			if (params.imageUrls.length > 0) {
				await tx.insert(Image).values(
					params.imageUrls.map((url, idx) => ({
						id: crypto.randomUUID(),
						entityType: "hotel_room",
						entityId: hotelRoomId,
						url,
						order: idx,
						isPrimary: idx === 0,
					}))
				)
			}
		})

		return { hotelRoomId, variantId }
	}
}
