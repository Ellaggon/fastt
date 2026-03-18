export interface EffectiveInventoryUpsertRow {
	variantId: string
	// ISO date (YYYY-MM-DD)
	date: string
	availableInventory: number
	computedAt: Date
}

export interface InventoryRepositoryPort {
	upsertEffectiveInventory(row: EffectiveInventoryUpsertRow): Promise<void>
}
