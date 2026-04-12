export type HoldInventoryResult =
	| { success: true; holdId: string; expiresAt: Date }
	| { success: false; reason: "not_available" }

export interface InventoryHoldRepositoryPort {
	findActiveHold(params: {
		holdId: string
		now: Date
	}): Promise<{ holdId: string; expiresAt: Date } | null>

	holdInventory(params: {
		holdId: string
		variantId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		expiresAt: Date
	}): Promise<HoldInventoryResult>

	releaseHold(params: { holdId: string }): Promise<{ released: boolean; days: number }>

	listExpiredHolds(params: { now: Date }): Promise<Array<{ holdId: string; variantId: string }>>
}
