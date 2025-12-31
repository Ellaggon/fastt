export interface SearchResponse {
	currency: string
	checkIn: string
	checkOut: string
	nights: number
	results: SearchProduct[]
}

export interface SearchProduct {
	product: {
		id: string
		name: string
	}
	variants: SearchVariant[]
}

export interface SearchVariant {
	id: string
	name: string
	capacity: number
	ratePlans: SearchRatePlan[]
}

export interface SearchRatePlan {
	id: string
	name: string
	refundable: boolean
	isDefault: boolean
	pricing: SearchPricing
}

export interface SearchPricing {
	currency: string
	base: number
	taxes: {
		included: TaxBreakdown[]
		excluded: TaxBreakdown[]
	}
	total: number
	breakdown: PricingLine[]
}

export interface TaxBreakdown {
	id: string
	name: string
	amount: number
}

export interface PricingLine {
	label: string
	amount: number
}
