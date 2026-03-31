import type { APIRoute } from "astro"
import { getHotelRoom } from "@/modules/catalog/public"
import { hotelRoomRepository } from "@/container"

export const GET: APIRoute = async ({ request, params }) => {
	const hotelId = String(params.id || "")
	const url = new URL(request.url)
	const hotelRoomId = url.searchParams.get("hotelRoomId")
	return getHotelRoom(
		{ repo: hotelRoomRepository },
		{ hotelId, hotelRoomId: String(hotelRoomId || "") }
	)
}
