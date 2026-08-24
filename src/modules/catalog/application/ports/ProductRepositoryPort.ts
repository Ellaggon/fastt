export type ProductStatusState = "draft" | "ready" | "published"

export type ProductAggregate = {
	product: {
		id: string
		name: string
		productType: string
		providerId?: string | null
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
	status: {
		productId: string
		state: ProductStatusState
		validationErrorsJson?: unknown | null
	} | null
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
		providerId?: string | null
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

	upsertProductStatus(params: {
		productId: string
		state: ProductStatusState
		validationErrorsJson?: unknown | null
	}): Promise<void>

	getProductAggregate(productId: string): Promise<ProductAggregate | null>
	getProductById?(productId: string): Promise<{
		id: string
		name: string
		productType: string
		providerId?: string | null
		geoPlaceId: string | null
	} | null>
}
