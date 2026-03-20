import {
	db,
	eq,
	and,
	Variant,
	Image,
	HotelRoomType,
	HotelRoomAmenity,
	DailyInventory,
	EffectiveInventory,
} from "astro:db"

import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"

export class HotelRoomRepository {
	constructor(private r2: S3Client) {}

	async getHotelRoomById(hotelRoomId: string): Promise<{ id: string; hotelId: string } | null> {
		if (!hotelRoomId) return null
		const row = await db
			.select({ id: HotelRoomType.id, hotelId: HotelRoomType.hotelId })
			.from(HotelRoomType)
			.where(eq(HotelRoomType.id, hotelRoomId))
			.get()
		return row ?? null
	}

	async getHotelRoomBundle(params: { hotelId: string; hotelRoomId: string }) {
		const row = await db
			.select()
			.from(HotelRoomType)
			.where(
				and(eq(HotelRoomType.hotelId, params.hotelId), eq(HotelRoomType.id, params.hotelRoomId))
			)
			.get()

		if (!row) return null

		const variant = await db
			.select()
			.from(Variant)
			.where(eq(Variant.entityId, (row as any).id))
			.get()

		const amenities = await db
			.select({ amenityId: HotelRoomAmenity.amenityId })
			.from(HotelRoomAmenity)
			.where(eq(HotelRoomAmenity.hotelRoomTypeId, (row as any).id))
			.all()

		const images = await db
			.select()
			.from(Image)
			.where(and(eq(Image.entityType, "hotel_room"), eq(Image.entityId, (row as any).id)))
			.orderBy(Image.order)
			.all()

		return {
			row,
			variant,
			amenities: amenities.map((a) => a.amenityId),
			images,
		}
	}

	async updateHotelRoom(params: {
		hotelRoomId: string
		totalRooms: number
		sizeM2?: number
		bathroom?: number
		hasBalcony: boolean
		hasView: string | null
		maxOccupancyOverride?: number
		bedType: unknown
		variant: {
			name: string
			description: string | null
			currency: string
			basePrice: number | null
			isActive: boolean
		}
		amenityIds: string[]
		imageUrls: string[]
	}): Promise<void> {
		await db
			.update(HotelRoomType)
			.set({
				totalRooms: params.totalRooms,
				sizeM2: params.sizeM2,
				bathroom: params.bathroom,
				hasBalcony: params.hasBalcony,
				hasView: params.hasView,
				maxOccupancyOverride: params.maxOccupancyOverride,
				bedType: params.bedType as any,
			})
			.where(eq(HotelRoomType.id, params.hotelRoomId))

		const variant = await db
			.select()
			.from(Variant)
			.where(eq(Variant.entityId, params.hotelRoomId))
			.get()

		if (variant) {
			await db
				.update(Variant)
				.set({
					name: params.variant.name || "Habitación",
					description: params.variant.description,
					currency: params.variant.currency,
					basePrice: params.variant.basePrice ?? (variant as any).basePrice,
					isActive: params.variant.isActive,
				})
				.where(eq(Variant.id, (variant as any).id))
		}

		await db
			.delete(HotelRoomAmenity)
			.where(eq(HotelRoomAmenity.hotelRoomTypeId, params.hotelRoomId))

		if (params.amenityIds.length > 0) {
			await db.insert(HotelRoomAmenity).values(
				params.amenityIds.map((amenityId) => ({
					id: crypto.randomUUID(),
					hotelRoomTypeId: params.hotelRoomId,
					amenityId,
					isAvailable: true,
				}))
			)
		}

		await db
			.delete(Image)
			.where(and(eq(Image.entityType, "hotel_room"), eq(Image.entityId, params.hotelRoomId)))

		if (params.imageUrls.length > 0) {
			await db.insert(Image).values(
				params.imageUrls.map((url, idx) => ({
					id: crypto.randomUUID(),
					entityType: "hotel_room",
					entityId: params.hotelRoomId,
					url,
					order: idx,
					isPrimary: idx === 0,
				}))
			)
		}
	}

	async deleteHotelRoomCascade(hotelRoomId: string) {
		if (!hotelRoomId) return

		// 1️⃣ Obtener habitación
		const room = await db
			.select()
			.from(HotelRoomType)
			.where(eq(HotelRoomType.id, hotelRoomId))
			.get()

		if (!room) return

		// 2️⃣ Obtener variant asociado
		const variant = await db
			.select()
			.from(Variant)
			.where(and(eq(Variant.entityId, hotelRoomId), eq(Variant.entityType, "hotel_room")))
			.get()

		// 3️⃣ Obtener imágenes (para borrar en R2 después)
		const images = await db
			.select()
			.from(Image)
			.where(and(eq(Image.entityId, hotelRoomId), eq(Image.entityType, "hotel_room")))
			.all()

		try {
			// 4️⃣ Delete amenities
			await db.delete(HotelRoomAmenity).where(eq(HotelRoomAmenity.hotelRoomTypeId, hotelRoomId))

			// 5️⃣ Delete images DB
			await db
				.delete(Image)
				.where(and(eq(Image.entityId, hotelRoomId), eq(Image.entityType, "hotel_room")))

			if (variant) {
				// 6️⃣ Delete DailyInventory
				await db.delete(DailyInventory).where(eq(DailyInventory.variantId, variant.id))

				// 7️⃣ Delete EffectiveInventory
				await db.delete(EffectiveInventory).where(eq(EffectiveInventory.variantId, variant.id))

				// 8️⃣ Delete Variant
				await db.delete(Variant).where(eq(Variant.id, variant.id))
			}

			// 9️⃣ Delete room
			await db.delete(HotelRoomType).where(eq(HotelRoomType.id, hotelRoomId))
		} catch (e) {
			console.error("Error deleting hotel room cascade:", e)
			throw e
		}

		// 🔟 Best effort R2 cleanup
		for (const img of images) {
			try {
				if (!img?.url) continue
				const key = new URL(img.url).pathname.replace(/^\/+/, "")

				await this.r2.send(
					new DeleteObjectCommand({
						Bucket: process.env.R2_BUCKET_NAME!,
						Key: key,
					})
				)

				console.log("Deleted from R2:", key)
			} catch (e) {
				console.error("Failed to delete R2 object:", e)
			}
		}
	}
}
