import type { APIRoute } from "astro"
import { getHotelRoom } from "@/modules/catalog/application/use-cases/get-hotel-room"

export const GET: APIRoute = async ({ request, params }) => {
	const hotelId = String(params.id || "")
	const url = new URL(request.url)
	const hotelRoomId = url.searchParams.get("hotelRoomId")
	return getHotelRoom({ hotelId, hotelRoomId: String(hotelRoomId || "") })
}
