export type DailyInventoryRow = {
	date: string
	totalInventory: number
	// Deprecated ARI compatibility: historical inventory stop-sell fallback.
	// Restrictions/EffectiveRestriction are the canonical sellability source.
	stopSell: boolean
}

export type InventoryLockRow = {
	date: string
	quantity: number
	expiresAt: Date
	bookingId: string | null
}

export type EffectiveAvailabilityUpsertRow = {
	id: string
	variantId: string
	date: string
	totalUnits: number
	heldUnits: number
	bookedUnits: number
	availableUnits: number
	// Deprecated ARI compatibility: kept for search read-model fallback.
	stopSell: boolean
	isSellable: boolean
	computedAt: Date
}

export interface InventoryRecomputeRepositoryPort {
	loadDailyInventoryRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<DailyInventoryRow[]>
	loadInventoryLocksRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<InventoryLockRow[]>
	upsertEffectiveAvailabilityRows(rows: EffectiveAvailabilityUpsertRow[]): Promise<void>
}
