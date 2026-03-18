// src/lib/db/hotelRoom.ts

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

import { r2 } from "../upload/r2"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

export async function deleteHotelRoomCascade(hotelRoomId: string) {
	if (!hotelRoomId) return

	// 1️⃣ Obtener habitación
	const room = await db.select().from(HotelRoomType).where(eq(HotelRoomType.id, hotelRoomId)).get()

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

			await r2.send(
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
