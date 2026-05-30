import type { VariantRoomProfileRepositoryPort } from "../ports/VariantRoomProfileRepositoryPort"

export function createResolveHotelTypeQuery(deps: { repo: VariantRoomProfileRepositoryPort }) {
	return async function resolveHotelType(ids: string[]) {
		return deps.repo.getByIds(ids)
	}
}
