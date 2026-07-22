import { db, inArray, eq, AmenityRoom, VariantRoomAmenity } from "@/shared/infrastructure/db/compat"
import type {
	HotelAmenityQueryRepositoryPort,
	HotelAmenityRow,
} from "../../application/ports/HotelAmenityQueryRepositoryPort"

export class HotelAmenityQueryRepository implements HotelAmenityQueryRepositoryPort {
	async listByRoomTypeIds(roomTypeIds: string[]): Promise<HotelAmenityRow[]> {
		const variantIds = [...new Set(roomTypeIds.map((id) => String(id).trim()).filter(Boolean))]
		if (!variantIds.length) return []

		return db
			.select({
				roomId: VariantRoomAmenity.variantId,
				amenityId: AmenityRoom.id,
				amenityName: AmenityRoom.name,
				category: AmenityRoom.category,
				isAvailable: VariantRoomAmenity.isAvailable,
			})
			.from(VariantRoomAmenity)
			.leftJoin(AmenityRoom, eq(VariantRoomAmenity.amenityId, AmenityRoom.id))
			.where(inArray(VariantRoomAmenity.variantId, variantIds))
	}
}
