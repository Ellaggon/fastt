import type { ImageQueryRepositoryPort } from "../ports/ImageQueryRepositoryPort"

export function createResolveRoomImagesQuery(deps: { repo: ImageQueryRepositoryPort }) {
	return async function resolveRoomImages(roomTypeIds: string[]) {
		return deps.repo.getByEntityIds("hotel_room", roomTypeIds)
	}
}
