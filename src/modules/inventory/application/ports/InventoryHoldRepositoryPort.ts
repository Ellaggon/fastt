import type { HoldCommercialSnapshot } from "../hold-commercial-snapshot"

export type HoldInventoryResult =
	| { success: true; holdId: string; expiresAt: Date }
	| { success: false; reason: "not_available" }

export interface InventoryHoldRepositoryPort {
	findActiveHold(params: { holdId: string; now: Date }): Promise<{
		holdId: string
		expiresAt: Date
		commercialSnapshotJson: HoldCommercialSnapshot | null
	} | null>

	holdInventory(params: {
		holdId: string
		variantId: string
		ratePlanId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		expiresAt: Date
		channel?: string | null
		policySnapshotJson: unknown
		guestExpectationsSnapshotJson?: unknown | null
		commercialSnapshot: HoldCommercialSnapshot
	}): Promise<HoldInventoryResult>

	findHoldSnapshot(params: { holdId: string }): Promise<{
		policySnapshotJson: unknown
		guestExpectationsSnapshotJson?: unknown | null
		commercialSnapshotJson: HoldCommercialSnapshot | null
		priceQuoteId: string | null
	} | null>

	releaseHold(params: { holdId: string }): Promise<{ released: boolean; days: number }>

	listExpiredHolds(params: {
		now: Date
	}): Promise<Array<{ holdId: string; variantId: string; from: string; to: string }>>
}
