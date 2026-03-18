export interface DailyInventorySnapshot {
	totalInventory: number
	reservedCount: number
}

export function canReserveInventory(params: {
	days: DailyInventorySnapshot[]
	quantity: number
}): boolean {
	if (!params.days.length) return false

	const available = Math.min(...params.days.map((d) => d.totalInventory - d.reservedCount))

	return available >= params.quantity
}
