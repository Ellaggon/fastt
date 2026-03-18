import { DailyInventoryRepository } from "@/repositories/AvailabilityRepository"

export class AvailabilityService {
	constructor(private repo = new DailyInventoryRepository()) {}

	async canReserve(
		roomTypeId: string,
		checkIn: Date,
		checkOut: Date,
		quantity: number
	) {
		const days = await this.repo.getRange(roomTypeId, checkIn, checkOut)
		if (!days.length) return false

		const available = Math.min(
			...days.map((d) => d.totalInventory - d.reservedCount)
		)

		return available >= quantity
	}
}