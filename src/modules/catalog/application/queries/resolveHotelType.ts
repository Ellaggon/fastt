import type { HotelRoomTypeRepositoryPort } from "../ports/HotelRoomTypeRepositoryPort"

export function createResolveHotelTypeQuery(deps: { repo: HotelRoomTypeRepositoryPort }) {
	return async function resolveHotelType(ids: string[]) {
		return deps.repo.getByIds(ids)
	}
}
