import { db, inArray, eq, AmenityRoom, HotelRoomAmenity } from "astro:db"
import type {
	HotelAmenityQueryRepositoryPort,
	HotelAmenityRow,
} from "../../application/ports/HotelAmenityQueryRepositoryPort"

export class HotelAmenityQueryRepository implements HotelAmenityQueryRepositoryPort {
	async listByRoomTypeIds(roomTypeIds: string[]): Promise<HotelAmenityRow[]> {
		if (!roomTypeIds.length) return []

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
			.where(inArray(HotelRoomAmenity.hotelRoomTypeId, roomTypeIds))
			.all()
	}
}
