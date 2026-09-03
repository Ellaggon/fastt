export type ProductPublicationState = "draft" | "ready" | "published"

export type ProductAggregate = {
	product: {
		id: string
		name: string
		productType: string
		providerId: string
		geoPlaceId: string | null
		dataClass?: string
	}
	imagesCount: number
	subtypeExists: boolean
	content: {
		productId: string
		description?: string | null
		highlightsJson?: unknown | null
		seoJson?: unknown | null
	} | null
	location: {
		productId: string
		address?: string | null
		lat?: number | null
		lng?: number | null
	} | null
	publication: {
		state: ProductPublicationState
		validationErrorsJson?: unknown | null
		updatedAt?: Date | null
	}
	verticalReadiness?: {
		kind: "hotel" | "tour" | "package" | "limousine" | "unknown"
		subtypeExists: boolean
		hotel?: {
			variantCount: number
			completeRoomCount: number
		}
		tour?: {
			hasItinerary: boolean
			itinerarySteps: number
			hasMeetingPoint: boolean
			hasDurationMinutes: boolean
			hasIncludes: boolean
			hasCategory: boolean
			hasActiveTickets: boolean
			hasSchedule: boolean
			imageCount: number
			slotCount?: number
			completeSlotCount?: number
			activeSlotCount?: number
		}
		package?: {
			hasDaysAndNights: boolean
			hasItinerary: boolean
			hasInclusions: boolean
		}
		limousine?: {
			hasVehicle: boolean
			hasPickupDropoff: boolean
			hasCapacity: boolean
		}
	}
}

export interface ProductRepositoryPort {
	createProductBase(params: {
		id: string
		name: string
		productType: string
		providerId: string
		geoPlaceId: string
		dataClass?: string
	}): Promise<void>

	upsertProductContent(params: {
		productId: string
		description?: string | null
		highlightsJson?: unknown | null
		seoJson?: unknown | null
	}): Promise<void>

	upsertProductLocation(params: {
		productId: string
		address?: string | null
		lat?: number | null
		lng?: number | null
	}): Promise<void>

	setProductGeoPlace?(params: {
		productId: string
		geoPlaceId: string
		actorId?: string | null
		source: string
	}): Promise<void>

	setProductPublication(params: {
		productId: string
		state: ProductPublicationState
		validationErrorsJson?: unknown | null
	}): Promise<void>

	getProductAggregate(productId: string): Promise<ProductAggregate | null>
	getProductPublicationEligibility?(productId: string): Promise<{
		eligible: boolean
		reason:
			| "missing_product"
			| "missing_provider"
			| "provider_not_commercial"
			| "not_production"
			| null
	}>
	getProductById?(productId: string): Promise<{
		id: string
		name: string
		productType: string
		providerId: string
		geoPlaceId: string | null
	} | null>
}
