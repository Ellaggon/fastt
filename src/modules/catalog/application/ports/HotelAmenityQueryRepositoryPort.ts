export type HotelAmenityRow = {
	roomId: string
	amenityId: string | null
	amenityName: string | null
	category: string | null
	isAvailable: boolean
}

export interface HotelAmenityQueryRepositoryPort {
	listByRoomTypeIds(roomTypeIds: string[]): Promise<HotelAmenityRow[]>
}
