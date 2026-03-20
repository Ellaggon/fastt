export interface HotelRoomQueryRepositoryPort {
	getHotelRoomById(hotelRoomId: string): Promise<{ id: string; hotelId: string } | null>

	getHotelRoomBundle(params: { hotelId: string; hotelRoomId: string }): Promise<{
		row: unknown
		variant: unknown
		amenities: string[]
		images: unknown[]
	} | null>

	updateHotelRoom(params: {
		hotelRoomId: string
		totalRooms: number
		sizeM2?: number
		bathroom?: number
		hasBalcony: boolean
		hasView: string | null
		maxOccupancyOverride?: number
		bedType: unknown
		variant: {
			name: string
			description: string | null
			currency: string
			basePrice: number | null
			isActive: boolean
		}
		amenityIds: string[]
		imageUrls: string[]
	}): Promise<void>
}
