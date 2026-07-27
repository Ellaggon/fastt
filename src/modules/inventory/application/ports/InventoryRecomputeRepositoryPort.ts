export type DailyInventoryRow = {
	date: string
	totalInventory: number
}

export type InventoryLockRow = {
	date: string
	quantity: number
	expiresAt: Date
	bookingId: string | null
}

export type ExternalCalendarBlockRow = {
	date: string
	quantity: number
}

export type EffectiveAvailabilityUpsertRow = {
	id: string
	variantId: string
	date: string
	totalUnits: number
	heldUnits: number
	bookedUnits: number
	externalBlockedUnits: number
	availableUnits: number
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
	loadExternalCalendarBlocksRange(params: {
		variantId: string
		from: string
		to: string
	}): Promise<ExternalCalendarBlockRow[]>
	upsertEffectiveAvailabilityRows(rows: EffectiveAvailabilityUpsertRow[]): Promise<void>
}
