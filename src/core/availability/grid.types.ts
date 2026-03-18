export type AvailabilityGridCell = {
	date: string
	availableRooms: number
	price: number
	stopSell: boolean
	cta: boolean
	ctd: boolean
}

export type AvailabilityGrid = AvailabilityGridCell[]
