export interface DailyInventorySnapshot {
	totalInventory: number
	reservedCount: number
}

export function recomputeInventory(params: DailyInventorySnapshot): number {
	// Keep the exact semantics from the legacy service: never return negative availability.
	return Math.max(0, params.totalInventory - params.reservedCount)
}
