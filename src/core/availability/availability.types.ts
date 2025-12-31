export interface AvailabilityRequest {
	hotelRoomTypeId: string
	ratePlanId: string
	checkIn: string // ISO
	checkOut: string // ISO
	quantity: number
}

export interface AvailabilityResult {
	available: boolean
	reason?: string
}
