// import { DailyInventoryRepository } from "@/repositories/AvailabilityRepository"

// export class AvailabilityBinaryEngine {
// 	constructor(private inventoryRepo = new DailyInventoryRepository()) {}

// 	async check(params: { entityId: string; checkIn: Date; checkOut: Date }) {
// 		const rows = await this.inventoryRepo.getRange(params.entityId, params.checkIn, params.checkOut)

// 		for (const r of rows) {
// 			const available = r.totalInventory - r.reservedCount
// 			if (available <= 0) return false
// 		}

// 		return true
// 	}
// }
