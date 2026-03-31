export interface RatePlanQueryRepositoryPort {
	listByVariant(variantId: string): Promise<unknown[]>
	getById(ratePlanId: string): Promise<unknown | null>
}
