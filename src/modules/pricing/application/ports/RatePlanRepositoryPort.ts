// Minimal shape required by current selection engine.
export interface RatePlanRepositoryPort {
	getActiveByVariant(variantId: string): Promise<any[]>
	getDefaultByVariant(variantId: string): Promise<any | null>
}
