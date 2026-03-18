import { toISODate } from "@/core/date/date.utils"

export class AvailabilityGridEngine {
	buildGridFromMemory(
		inventory: {
			date: string
			totalInventory: number
			reservedCount: number
			stopSell?: boolean
		}[],
		checkIn: Date,
		checkOut: Date
	) {
		const start = toISODate(checkIn)
		const end = toISODate(checkOut)

		return inventory
			.filter((d) => d.date >= start && d.date < end)
			.map((d) => ({
				date: d.date,
				availableRooms: d.totalInventory - d.reservedCount,
				stopSell: d.stopSell ?? false,
			}))
	}
}
