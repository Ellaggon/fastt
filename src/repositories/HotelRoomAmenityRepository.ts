import { db, HotelRoomAmenity, inArray } from "astro:db"

export class HotelRoomAmenityRepository {
	async getByRoomTypes(roomTypeIds: string[]) {
		if (!roomTypeIds.length) return []

		return db
			.select()
			.from(HotelRoomAmenity)
			.where(inArray(HotelRoomAmenity.hotelRoomTypeId, roomTypeIds))
			.all()
	}
}