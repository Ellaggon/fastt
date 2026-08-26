export type VariantKind = "hotel_room" | "tour_slot" | "package_base" | "limousine_service"
export type VariantLifecycleState = "draft" | "ready" | "archived"

export type VariantCore = {
	id: string
	productId: string
	kind: VariantKind
	name: string
	description?: string | null
	lifecycleState: VariantLifecycleState
	createdAt: Date
	salesEnabled: boolean
}

export type VariantCapacity = {
	variantId: string
	minOccupancy: number
	maxOccupancy: number
	maxAdults?: number | null
	maxChildren?: number | null
}

export type VariantLifecycleEvaluation = {
	variantId: string
	lifecycleState: "draft" | "ready"
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
		externalCode?: string | null
		lifecycleState: VariantLifecycleState
		salesEnabled: boolean
	} | null>

	createVariant(params: {
		id: string
		productId: string
		kind: VariantKind
		name: string
		description?: string | null
		lifecycleState: VariantLifecycleState
		createdAt: Date
		salesEnabled: boolean
	}): Promise<void>

	upsertCapacity(params: VariantCapacity): Promise<void>
	getCapacity(variantId: string): Promise<VariantCapacity | null>

	attachHotelRoomSubtype(params: { variantId: string; roomTypeId: string }): Promise<void>
	getHotelRoomSubtype(variantId: string): Promise<{ variantId: string; roomTypeId: string } | null>
	existsHotelRoomSubtypeForProductRoomType(params: {
		productId: string
		roomTypeId: string
	}): Promise<boolean>

	persistLifecycleEvaluation(params: VariantLifecycleEvaluation): Promise<void>
	getLifecycleEvaluation(variantId: string): Promise<VariantLifecycleEvaluation | null>

	updateVariantLifecycle(params: {
		variantId: string
		lifecycleState: VariantLifecycleState
	}): Promise<void>
	setVariantSalesEnabled(params: { variantId: string; salesEnabled: boolean }): Promise<void>
	deleteVariantCascade(variantId: string): Promise<void>

	countDailyInventoryDays(variantId: string): Promise<number>
	countVariantImages(variantId: string): Promise<number>
	hasTourSlotProfile(variantId: string): Promise<boolean>
}
