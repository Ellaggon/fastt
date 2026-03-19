import type { APIRoute } from "astro"
import { hotelRoomRepository } from "@/container"
import { deleteHotelRoom } from "@/modules/catalog/application/use-cases/delete-hotel-room"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const hotelId = String(params.id || "")
		const body = await request.json()
		const { hotelRoomId } = body || {}
		return await deleteHotelRoom({
			hotelId,
			hotelRoomId: String(hotelRoomId || ""),
			deleteCascade: (id) => hotelRoomRepository.deleteHotelRoomCascade(id),
		})
	} catch (err) {
		console.error("delete hotel room error:", err)
		return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 })
	}
}
