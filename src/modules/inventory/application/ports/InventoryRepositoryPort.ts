export interface InventoryRepositoryPort {
	getEffectiveRange(
		variantId: string,
		checkIn: Date,
		checkOut: Date
	): Promise<
		Array<{ date: string; availableUnits: number; isSellable: boolean; stopSell: boolean }>
	>
}
