import { and, db, eq, HotelRoomAmenity, HotelRoomType, Image, Variant } from "astro:db"

export async function getHotelRoom(params: {
	hotelId: string
	hotelRoomId: string
}): Promise<Response> {
	const { hotelId, hotelRoomId } = params

	if (!hotelId || !hotelRoomId)
		return new Response(JSON.stringify({ found: false, error: "Missing hotelId or hotelRoomId" }), {
			status: 400,
		})

	const row = await db
		.select()
		.from(HotelRoomType)
		.where(and(eq(HotelRoomType.hotelId, hotelId), eq(HotelRoomType.id, hotelRoomId)))
		.get()

	if (!row) return new Response(JSON.stringify({ found: false }), { status: 200 })

	const variant = await db.select().from(Variant).where(eq(Variant.entityId, row.id)).get()

	const amenities = await db
		.select({ amenityId: HotelRoomAmenity.amenityId })
		.from(HotelRoomAmenity)
		.where(eq(HotelRoomAmenity.hotelRoomTypeId, row.id))
		.all()

	const images = await db
		.select()
		.from(Image)
		.where(and(eq(Image.entityType, "hotel_room"), eq(Image.entityId, row.id)))
		.orderBy(Image.order)
		.all()

	return new Response(
		JSON.stringify({
			found: true,
			row,
			variant,
			amenities: amenities.map((a) => a.amenityId),
			images,
		}),
		{ status: 200 }
	)
}
