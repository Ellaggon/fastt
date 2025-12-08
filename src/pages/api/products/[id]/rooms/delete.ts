import type { APIRoute } from "astro"
import { db, HotelRoomType, Variant, Image, HotelRoomAmenity, eq, and } from "astro:db"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const hotelId = params.id
		const body = await request.json()
		const { hotelRoomId } = body

		if (!hotelId || !hotelRoomId) {
			return new Response(JSON.stringify({ error: "Faltan parámetros obligatorios" }), {
				status: 400,
			})
		}

		// 1. Verificar que la habitación exista y pertenezca al hotel
		const room = await db.select().from(HotelRoomType).where(eq(HotelRoomType.id, hotelRoomId))

		if (room.length === 0) {
			return new Response(JSON.stringify({ error: "La habitación no existe" }), { status: 404 })
		}

		if (room[0].hotelId !== hotelId) {
			return new Response(JSON.stringify({ error: "La habitación no pertenece a este hotel" }), {
				status: 403,
			})
		}

		// 2. Eliminar amenities relacionados
		await db.delete(HotelRoomAmenity).where(eq(HotelRoomAmenity.hotelRoomTypeId, hotelRoomId))

		// 3. Eliminar imágenes relacionadas
		await db
			.delete(Image)
			.where(eq(Image.entityId, hotelRoomId) && eq(Image.entityType, "hotel_room"))

		// 4. Eliminar Variant override
		await db
			.delete(Variant)
			.where(and(eq(Variant.entityId, hotelRoomId), eq(Variant.entityType, "hotel_room")))

		// 5. Eliminar finalmente la habitación
		await db.delete(HotelRoomType).where(eq(HotelRoomType.id, hotelRoomId))

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (err) {
		console.error(err)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
