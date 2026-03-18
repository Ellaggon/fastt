import { toISODate } from "@/core/date/date.utils"
import { DailyInventoryRepository } from "@/repositories/AvailabilityRepository"

export class InventorySeederService {
	constructor(private repo = new DailyInventoryRepository()) {}

	async seed(roomTypeId: string, totalRooms: number) {
		const today = new Date()

		for (let i = 0; i < 365; i++) {
			const date = new Date(today)
			date.setDate(date.getDate() + i)

			await this.repo.upsert({
				id: crypto.randomUUID(),
				variantId: roomTypeId,
				date: toISODate(date),
				totalInventory: totalRooms,
				reservedCount: 0,
			})
		}
	}
}
