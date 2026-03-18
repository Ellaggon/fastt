import type { APIRoute } from "astro"
import { db, HotelRoomType, eq } from "astro:db"
import { hotelRoomRepository } from "@/container"

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

		// 1️⃣ Verificar que exista
		const room = await db
			.select()
			.from(HotelRoomType)
			.where(eq(HotelRoomType.id, hotelRoomId))
			.get()

		if (!room) {
			return new Response(JSON.stringify({ error: "La habitación no existe" }), { status: 404 })
		}

		// 2️⃣ Verificar pertenencia
		if (room.hotelId !== hotelId) {
			return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 })
		}

		// 3️⃣ Cascade delete real
		await hotelRoomRepository.deleteHotelRoomCascade(hotelRoomId)

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (err) {
		console.error("delete hotel room error:", err)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
