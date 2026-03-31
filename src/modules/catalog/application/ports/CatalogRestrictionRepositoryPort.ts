export interface CatalogRestrictionRepositoryPort {
	listRestrictionsByProduct(productId: string): Promise<unknown[]>

	listRestrictionRooms(productId: string): Promise<Array<{ id: string; name: string | null }>>

	listRestrictionRatePlans(productId: string): Promise<Array<{ id: string; name: string | null }>>

	findOverlap(params: {
		scope: unknown
		scopeId: unknown
		type: unknown
		startDateISO: string
		endDateISO: string
		excludeId?: string
	}): Promise<boolean>

	createRestriction(params: {
		id: string
		scope: unknown
		scopeId: unknown
		type: unknown
		value: unknown
		startDateISO: string
		endDateISO: string
		validDays: unknown
		isActive: boolean
		priority: number
	}): Promise<void>

	updateRestriction(params: { ruleId: string; patch: Record<string, unknown> }): Promise<void>

	deleteRestriction(ruleId: string): Promise<void>
}
