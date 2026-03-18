import { db, HotelRoomType, inArray } from "astro:db"

export class HotelRoomTypeRepository {

	async getByIds(ids: string[]) {
		if (!ids.length) return []

		return db
			.select()
			.from(HotelRoomType)
			.where(inArray(HotelRoomType.id, ids))
			.all()
	}
}