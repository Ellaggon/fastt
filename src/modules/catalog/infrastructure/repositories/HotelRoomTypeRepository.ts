import { db, HotelRoomType, inArray } from "astro:db"
import type { HotelRoomTypeRepositoryPort } from "../../application/ports/HotelRoomTypeRepositoryPort"

export class HotelRoomTypeRepository implements HotelRoomTypeRepositoryPort {
	async getByIds(ids: string[]) {
		if (!ids.length) return []

		return db.select().from(HotelRoomType).where(inArray(HotelRoomType.id, ids)).all()
	}
}
