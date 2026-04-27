export type SearchUnitMaterializationStoredRow = {
	variantId: string
	ratePlanId: string
	date: string
	occupancyKey: string
	totalGuests: number
	hasAvailability: boolean
	hasPrice: boolean
	isSellable: boolean
	isAvailable: boolean
	availableUnits: number
	stopSell: boolean
	pricePerNight: number | null
	currency: string
	primaryBlocker: string | null
	minStay: number | null
	cta: boolean
	ctd: boolean
	computedAt: string
	sourceVersion: string
}

export type SearchUnitMaterializationUpsertRow = {
	id: string
	variantId: string
	productId: string
	ratePlanId: string
	date: string
	occupancyKey: string
	totalGuests: number
	hasAvailability: boolean
	hasPrice: boolean
	isSellable: boolean
	isAvailable: boolean
	availableUnits: number
	stopSell: boolean
	pricePerNight: number | null
	currency: string
	primaryBlocker: string | null
	minStay: number | null
	cta: boolean
	ctd: boolean
	computedAt: Date
	sourceVersion: string
}

export type SearchUnitMaterializationInputs = {
	availabilityRow:
		| {
				isSellable?: boolean | null
				stopSell?: boolean | null
				availableUnits?: number | null
		  }
		| null
		| undefined
	pricingRow:
		| {
				finalBasePrice?: number | null
		  }
		| null
		| undefined
	restrictionRow:
		| {
				stopSell?: boolean | null
				minStay?: number | null
				cta?: boolean | null
				ctd?: boolean | null
		  }
		| null
		| undefined
}

export type SearchUnitMaterializationRepositoryPort = {
	resolveProductId(variantId: string): Promise<string | null>
	loadMaterializationInputs(params: {
		variantId: string
		ratePlanId: string
		date: string
	}): Promise<SearchUnitMaterializationInputs>
	resolveSourceVersion(params: {
		variantId: string
		ratePlanId: string
		date: string
	}): Promise<string>
	getSearchUnitViewRow(params: {
		variantId: string
		ratePlanId: string
		date: string
		occupancyKey: string
	}): Promise<SearchUnitMaterializationStoredRow | null>
	upsertSearchUnitViewRow(row: SearchUnitMaterializationUpsertRow): Promise<void>
	resolveDefaultRatePlanIds(variantId: string): Promise<string[]>
	resolveGuestRange(variantId: string): Promise<number[]>
	purgeStaleSearchUnitRows(cutoff: Date): Promise<number>
}
