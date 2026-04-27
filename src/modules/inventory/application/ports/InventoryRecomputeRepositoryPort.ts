export type DailyInventoryRow = {
	date: string
	totalInventory: number
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
