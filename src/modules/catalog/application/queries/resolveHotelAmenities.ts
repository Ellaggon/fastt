import type { HotelAmenityQueryRepositoryPort } from "../ports/HotelAmenityQueryRepositoryPort"

export function createResolveHotelAmenitiesQuery(deps: { repo: HotelAmenityQueryRepositoryPort }) {
	return async function resolveHotelAmenities(roomIds: string[]) {
		if (!roomIds.length) return []

		return deps.repo.listByRoomTypeIds(roomIds)
	}
}
