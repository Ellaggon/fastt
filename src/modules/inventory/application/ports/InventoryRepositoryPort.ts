export interface InventoryRepositoryPort {
	getEffectiveRange(
		variantId: string,
		checkIn: Date,
		checkOut: Date
	): Promise<
		// Deprecated compatibility shape for legacy search adapters. Inventory is
		// physical-only; stopSell is always false and sellability means capacity > 0.
		Array<{ date: string; availableUnits: number; isSellable: boolean; stopSell: boolean }>
	>
}
