export type HoldInventoryResult =
	| { success: true; holdId: string }
	| { success: false; reason: "not_available" }

export interface InventoryHoldRepositoryPort {
	holdInventory(params: {
		holdId: string
		variantId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		expiresAt: Date
	}): Promise<HoldInventoryResult>

	releaseHold(params: { holdId: string }): Promise<{ released: boolean; days: number }>

	listExpiredHoldIds(params: { now: Date }): Promise<string[]>
}
