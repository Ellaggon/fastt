import { ImageRepository } from "@/repositories/ImageRepository"

const repo = new ImageRepository()

export async function resolveRoomImages(roomTypeIds: string[]) {
	return repo.getByEntityIds("hotel_room", roomTypeIds)
}