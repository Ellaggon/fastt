import type { APIRoute } from "astro"
import { db, eq, HotelRoomType } from "astro:db"
import { ROOM_TYPES } from "@/data/room-types"

export const POST: APIRoute = async ({ request }) => {
	try {
		const formData = await request.formData()
		const hotelId = formData.get("hotelId")?.toString()

		if (!hotelId) {
			return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), { status: 400 })
		}

		const roomTypeEntries = []

		// Iteramos sobre el array estático
		for (const roomType of ROOM_TYPES) {
			const availableRooms = parseFloat(
				formData.get(`availableRooms-${roomType.id}`)?.toString() || "0"
			)
			const priceUSD = parseFloat(formData.get(`priceUSD-${roomType.id}`)?.toString() || "0")
			const priceBOB = parseFloat(formData.get(`priceBOB-${roomType.id}`)?.toString() || "0")

			if (availableRooms > 0 && priceUSD > 0 && priceBOB > 0) {
				roomTypeEntries.push({
					hotelId,
					roomTypeId: roomType.id,
					availableRooms,
					priceUSD,
					priceBOB,
				})
			}
		}

		// La lógica es que cada vez que se envía el formulario, se considera una nueva configuración completa.
		await db.delete(HotelRoomType).where(eq(HotelRoomType.hotelId, hotelId))

		if (roomTypeEntries.length > 0) {
			await db.insert(HotelRoomType).values(roomTypeEntries)
		}

		return new Response(
			JSON.stringify({ message: "Configuracion de habitacion guardada exitosamente" }),
			{ status: 200 }
		)
	} catch (e) {
		console.error("Error al guardar la configuración de la habitación: ", e)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
