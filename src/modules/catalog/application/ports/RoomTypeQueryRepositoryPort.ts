export type RoomTypeRow = {
	id: string
	name: string
	maxOccupancy: number | null
}

export interface RoomTypeQueryRepositoryPort {
	listRoomTypes(): Promise<RoomTypeRow[]>
}
