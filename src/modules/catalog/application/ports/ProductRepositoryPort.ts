export type ProductStatusState = "draft" | "ready" | "published"

export type ProductAggregate = {
	product: {
		id: string
		name: string
		productType: string
		providerId?: string | null
		destinationId: string
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
	subtypeDetails?:
		| {
				kind: "hotel"
				stars?: number | null
		  }
		| {
				kind: "tour"
				duration?: string | null
				difficultyLevel?: string | null
		  }
		| {
				kind: "package"
				itinerary?: string | null
				days?: number | null
				nights?: number | null
				includes?: string | null
				excludes?: string | null
		  }
		| null
}

export interface ProductRepositoryPort {
	createProductBase(params: {
		id: string
		name: string
		productType: string
		providerId?: string | null
		destinationId: string
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
		destinationId: string
	} | null>
}
