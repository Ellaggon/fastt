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

	countDailyInventoryDays(variantId: string): Promise<number>
}
