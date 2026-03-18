export class InventoryReservationService {
	reserve(params: { totalInventory: number; reservedCount: number; quantity: number }) {
		const available = params.totalInventory - params.reservedCount

		if (available < params.quantity) {
			throw new Error("Not enough availability")
		}

		return params.reservedCount + params.quantity
	}

	release(params: { reservedCount: number; quantity: number }) {
		return Math.max(0, params.reservedCount - params.quantity)
	}
}
