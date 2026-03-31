export interface HotelRoomTypeRepositoryPort {
	getByIds(ids: string[]): Promise<unknown[]>
}
