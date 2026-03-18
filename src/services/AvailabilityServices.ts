import type { DailyInventoryRepositoryPort } from "@/modules/inventory/application/ports/DailyInventoryRepositoryPort"
import { canReserveInventory } from "@/modules/inventory/application/use-cases/can-reserve-inventory"

export class AvailabilityService {
	constructor(private repo: DailyInventoryRepositoryPort) {}

	async canReserve(roomTypeId: string, checkIn: Date, checkOut: Date, quantity: number) {
		const days = await this.repo.getRange(roomTypeId, checkIn, checkOut)
		return canReserveInventory({ days, quantity })
	}
}
