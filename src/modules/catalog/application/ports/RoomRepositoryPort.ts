export interface CreateHotelRoomParams {
	hotelId: string
	roomTypeId: string
	totalRooms: number
	hasView: string | null
	maxOccupancyOverride?: number
	bedType: unknown[] | null
	sizeM2?: number
	bathroom?: number
	hasBalcony: boolean

	variant: {
		name: string
		description: string | null
		currency: string
		basePrice: number
	}

	amenityIds: string[]
	imageUrls: string[]
}

export interface CreateHotelRoomResult {
	hotelRoomId: string
	variantId: string
}

export interface RoomRepositoryPort {
	hotelExistsByProductId(hotelId: string): Promise<boolean>
	createHotelRoom(params: CreateHotelRoomParams): Promise<CreateHotelRoomResult>
}
