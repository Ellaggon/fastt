import { HotelRoomTypeRepository } from "@/repositories/HotelRoomTypeRepository"

const repo = new HotelRoomTypeRepository()

export async function resolveHotelType(ids: string[]) {
    return repo.getByIds(ids)
}