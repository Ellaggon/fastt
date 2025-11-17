// src/pages/api/products/[id]/rooms/get.ts
import type { APIRoute } from "astro"
import { db, HotelRoomType, HotelRoomAmenity, Image, and, eq } from "astro:db"

export const GET: APIRoute = async ({ request, params }) => {
	const hotelId = String(params.hotelId || "")
	const url = new URL(request.url)
	const roomTypeId = url.searchParams.get("roomTypeId") || ""
	if (!hotelId || !roomTypeId)
		return new Response(JSON.stringify({ found: false }), { status: 400 })

	const row = await db
		.select()
		.from(HotelRoomType)
		.where(and(eq(HotelRoomType.hotelId, hotelId), eq(HotelRoomType.roomTypeId, roomTypeId)))
		.get()

	if (!row) return new Response(JSON.stringify({ found: false }), { status: 200 })

	// get amenities
	const ams = await db
		.select({ amenityId: HotelRoomAmenity.amenityId })
		.from(HotelRoomAmenity)
		.where(eq(HotelRoomAmenity.hotelRoomTypeId, row.id))
		.all()

	// get images
	const imgs = await db
		.select()
		.from(Image)
		.where(and(eq(Image.entityType, "HotelRoomType"), eq(Image.entityId, row.id)))
		.orderBy(Image.order)
		.all()

	return new Response(
		JSON.stringify({ found: true, row, amenities: ams.map((a) => a.amenityId), images: imgs }),
		{ status: 200 }
	)
}
