export interface VariantInventoryConfigRow {
	variantId: string
	defaultTotalUnits: number
	horizonDays: number
	createdAt: Date
}

export interface VariantInventoryConfigRepositoryPort {
	getByVariantId(variantId: string): Promise<VariantInventoryConfigRow | null>
	upsert(params: {
		variantId: string
		defaultTotalUnits: number
		horizonDays?: number
	}): Promise<void>
}
