export interface RatePlan {
	pricing: {
		total: number
	}
}

export interface VariantAvailability {
	id: string
	ratePlans: RatePlan[]
}

export interface ProductAvailability {
	variants: VariantAvailability[]
}

export interface AvailabilityResponse {
	results: ProductAvailability[]
}
