import { db, RoomType, asc } from "astro:db"
import type {
	RoomTypeQueryRepositoryPort,
	RoomTypeRow,
} from "../../application/ports/RoomTypeQueryRepositoryPort"

export class RoomTypeQueryRepository implements RoomTypeQueryRepositoryPort {
	async listRoomTypes(): Promise<RoomTypeRow[]> {
		const rows = await db
			.select({
				id: RoomType.id,
				name: RoomType.name,
				maxOccupancy: RoomType.maxOccupancy,
			})
			.from(RoomType)
			.orderBy(asc(RoomType.name))
			.all()

		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			maxOccupancy: r.maxOccupancy ?? null,
		}))
	}
}
