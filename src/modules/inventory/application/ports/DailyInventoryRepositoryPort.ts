export interface DailyInventoryRangeRow {
	totalInventory: number
	reservedCount: number
}

export interface DailyInventoryUpsertRow {
	id: string
	variantId: string
	// ISO date (YYYY-MM-DD). Keep infrastructure free to store as text/date as needed.
	date: string
	totalInventory: number
	reservedCount: number
	priceOverride?: number | null
}

export interface DailyInventoryRepositoryPort {
	getRange(variantId: string, checkIn: Date, checkOut: Date): Promise<DailyInventoryRangeRow[]>
	upsert(row: DailyInventoryUpsertRow): Promise<void>
}
