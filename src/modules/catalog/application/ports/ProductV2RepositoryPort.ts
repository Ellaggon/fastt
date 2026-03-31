export type ProductV2StatusState = "draft" | "ready" | "published"

export type ProductV2Aggregate = {
	product: {
		id: string
		name: string
		productType: string
		description?: string | null
		providerId?: string | null
		destinationId: string
	}
	imagesCount: number
	subtypeExists: boolean
	content: {
		productId: string
		highlightsJson?: unknown | null
		rules?: string | null
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
		state: ProductV2StatusState
		validationErrorsJson?: unknown | null
	} | null
}

export interface ProductV2RepositoryPort {
	createProductBase(params: {
		id: string
		name: string
		productType: string
		description?: string | null
		providerId?: string | null
		destinationId: string
	}): Promise<void>

	upsertProductContent(params: {
		productId: string
		highlightsJson?: unknown | null
		rules?: string | null
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
		state: ProductV2StatusState
		validationErrorsJson?: unknown | null
	}): Promise<void>

	getProductAggregate(productId: string): Promise<ProductV2Aggregate | null>
}
