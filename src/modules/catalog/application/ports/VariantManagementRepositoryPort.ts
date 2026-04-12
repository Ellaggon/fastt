export type VariantKind = "hotel_room" | "tour_slot" | "package_base"
export type VariantLifecycleStatus = "draft" | "ready" | "sellable" | "archived"

export type VariantCore = {
	id: string
	productId: string
	kind: VariantKind
	name: string
	description?: string | null
	status: VariantLifecycleStatus
	createdAt: Date
	isActive: boolean
}

export type VariantCapacity = {
	variantId: string
	minOccupancy: number
	maxOccupancy: number
	maxAdults?: number | null
	maxChildren?: number | null
}

export type VariantReadinessSnapshot = {
	variantId: string
	state: "draft" | "ready"
	validationErrorsJson: unknown | null
}

export interface VariantManagementRepositoryPort {
	getProductById(
		productId: string
	): Promise<{ id: string; productType: string; providerId?: string | null } | null>
	getVariantById(variantId: string): Promise<{
		id: string
		productId: string
		kind?: string | null
		entityType: string
		entityId: string
		name: string
		description?: string | null
		status?: string | null
		isActive: boolean
	} | null>

	createVariant(params: {
		id: string
		productId: string
		kind: VariantKind
		name: string
		description?: string | null
		status: VariantLifecycleStatus
		createdAt: Date
		// Legacy mirror fields (kept for compatibility)
		entityType: string
		entityId: string
		isActive: boolean
	}): Promise<void>

	upsertCapacity(params: VariantCapacity): Promise<void>
	getCapacity(variantId: string): Promise<VariantCapacity | null>

	attachHotelRoomSubtype(params: { variantId: string; roomTypeId: string }): Promise<void>
	getHotelRoomSubtype(variantId: string): Promise<{ variantId: string; roomTypeId: string } | null>
	existsHotelRoomSubtypeForProductRoomType(params: {
		productId: string
		roomTypeId: string
	}): Promise<boolean>

	upsertReadiness(params: VariantReadinessSnapshot): Promise<void>
	getReadiness(variantId: string): Promise<VariantReadinessSnapshot | null>

	updateVariantStatus(params: {
		variantId: string
		status: VariantLifecycleStatus
		isActive?: boolean
	}): Promise<void>

	// CAPA 4A: pricing base rate (read-only). Used to emit pricing_missing accurately.
	hasBaseRate(variantId: string): Promise<boolean>
	getBaseRate(
		variantId: string
	): Promise<{ variantId: string; currency: string; basePrice: number } | null>

	// CAPA 4B: default rate plan + minimal rule snapshot for readiness signals.
	getDefaultRatePlanWithRules(variantId: string): Promise<{
		ratePlanId: string
		rules: Array<{
			id: string
			type: string
			value: number
			priority: number
			dateRange?: { from?: string | null; to?: string | null } | null
			dayOfWeek?: number[] | null
			createdAt: Date
		}>
	} | null>

	countEffectivePricingDays(params: { variantId: string; ratePlanId: string }): Promise<number>
	countDailyInventoryDays(variantId: string): Promise<number>
}
