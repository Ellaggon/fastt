export type CatalogProductAggregate = {
	id: string
	displayName: string
	productType: string
	status: string
	content: {
		description: string | null
		highlights: unknown
		rules: string | null
	}
	location: {
		address: string | null
		lat: number | null
		lng: number | null
	}
	images: Array<{
		id: string
		url: string
		objectKey: string
		isPrimary: boolean
		order: number
	}>
}

export type ProductFullAggregate = {
	id: string
	displayName: string
	productType: string
	status: string
	content: {
		description: string | null
		highlights: unknown
		rules: string | null
	}
	location: {
		address: string | null
		lat: number | null
		lng: number | null
	}
	images: Array<{
		id: string
		url: string
		objectKey: string
		isPrimary: boolean
		order: number
	}>
	subtype:
		| {
				kind: "hotel"
				stars: number | null
				phone: string | null
				email: string | null
		  }
		| {
				kind: "tour"
				duration: string | null
				difficultyLevel: string | null
				guideLanguages: unknown
		  }
		| {
				kind: "package"
				days: number | null
				nights: number | null
		  }
		| null
}

export type ProductVariantsAggregate = {
	product: {
		id: string
		displayName: string
		status: string
	}
	variants: Array<{
		id: string
		name: string
		kind: string | null
		status: string | null
		pricing: { hasBaseRate: boolean; hasDefaultRatePlan: boolean }
		capacity: {
			minOccupancy: number
			maxOccupancy: number
			maxAdults: number | null
			maxChildren: number | null
		} | null
		subtype: { roomTypeId: string; name: string | null } | null
	}>
}

export type VariantFullAggregate = {
	variant: {
		id: string
		productId: string
		name: string
		kind: string | null
		status: string | null
	}
	capacity: {
		minOccupancy: number
		maxOccupancy: number
		maxAdults: number | null
		maxChildren: number | null
	} | null
	subtype: { roomTypeId: string; name: string | null } | null
	baseRate: { currency: string; basePrice: number } | null
	defaultRatePlan: { ratePlanId: string } | null
	readiness: { state: "draft" | "ready"; validationErrorsJson: unknown | null } | null
}

export type ProviderFullAggregate = {
	provider: {
		id: string
		displayName: string | null
		legalName: string | null
		status: string | null
	}
	profile: {
		timezone: string | null
		defaultCurrency: string | null
		supportEmail: string | null
		supportPhone: string | null
	} | null
	latestVerification: {
		status: string | null
		reason: string | null
		createdAt: Date | string | null
	} | null
	ownerUser: { id: string; email: string } | null
}

export type ProviderBookingsAggregateInput = {
	providerId: string
	status?: string | null
	from?: string | null
	to?: string | null
}

export type ProviderBookingSummaryItem = {
	bookingId: string
	productId: string | null
	productName: string | null
	variantId: string | null
	variantName: string | null
	checkIn: string | null
	checkOut: string | null
	totalPrice: number
	currency: string
	status: string
	createdAt: string | null
	confirmedAt: string | null
}

export type ProviderBookingsAggregate = {
	items: ProviderBookingSummaryItem[]
}

export interface CatalogReadModelRepositoryPort {
	getProductAggregate(productId: string): Promise<CatalogProductAggregate | null>
	getProductFullAggregate(
		productId: string,
		providerId: string
	): Promise<ProductFullAggregate | null>
	getProductVariantsAggregate(
		productId: string,
		providerId: string
	): Promise<ProductVariantsAggregate | null>
	getVariantFullAggregate(
		productId: string,
		variantId: string,
		providerId: string
	): Promise<VariantFullAggregate | null>
	getProviderFullAggregate(
		providerId: string,
		currentUserId: string
	): Promise<ProviderFullAggregate | null>
	getProviderBookingsAggregate(
		input: ProviderBookingsAggregateInput
	): Promise<ProviderBookingsAggregate>
}
