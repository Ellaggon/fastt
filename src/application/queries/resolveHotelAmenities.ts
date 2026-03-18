import {
	db,
	inArray,
	eq,
	AmenityRoom,
	HotelRoomAmenity,
} from "astro:db"

export async function resolveHotelAmenities(roomIds: string[]) {
	if (!roomIds.length) return []

	return db
		.select({
			roomId: HotelRoomAmenity.hotelRoomTypeId,
			amenityId: AmenityRoom.id,
			amenityName: AmenityRoom.name,
			category: AmenityRoom.category,
			isAvailable: HotelRoomAmenity.isAvailable,
		})
		.from(HotelRoomAmenity)
		.leftJoin(AmenityRoom, eq(HotelRoomAmenity.amenityId, AmenityRoom.id))
		.where(inArray(HotelRoomAmenity.hotelRoomTypeId, roomIds))
		.all()
}