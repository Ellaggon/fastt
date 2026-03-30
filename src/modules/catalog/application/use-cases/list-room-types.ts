import type { RoomTypeQueryRepositoryPort } from "../ports/RoomTypeQueryRepositoryPort"

export async function listRoomTypes(deps: { repo: RoomTypeQueryRepositoryPort }) {
	return deps.repo.listRoomTypes()
}
