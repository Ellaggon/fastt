export type TaxFeeKind = "tax" | "fee"
export type TaxFeeCalculationType = "percentage" | "fixed"
export type TaxFeeInclusionType = "included" | "excluded"
export type TaxFeeAppliesPer = "stay" | "night" | "guest" | "guest_night"
export type TaxFeeScope = "global" | "provider" | "product" | "variant" | "rate_plan"
export type TaxFeeStatus = "active" | "archived"
export type TaxFeeEditingState = "draft" | "published"
export type TaxFeeCollectionResponsibility = "provider" | "platform" | "marketplace"
export type TaxFeeTaxableBase = "booking_base" | "base_plus_included"

export type TaxFeeJurisdictionRule = {
	country?: string
	region?: string
	city?: string
	collectionResponsibility?: TaxFeeCollectionResponsibility
	taxableBase?: TaxFeeTaxableBase
	exemptGuestResidenceCountries?: string[]
	maxAmount?: number | null
	maxNights?: number | null
	seasonalMode?: "restrict" | "override"
	seasons?: Array<{ from: string; to: string; value?: number | null }>
}

export type TaxFeeDefinition = {
	id: string
	providerId: string | null
	code: string
	name: string
	kind: TaxFeeKind
	calculationType: TaxFeeCalculationType
	value: number
	currency: string | null
	inclusionType: TaxFeeInclusionType
	appliesPer: TaxFeeAppliesPer
	priority: number
	jurisdictionJson: unknown | null
	effectiveFrom: Date | null
	effectiveTo: Date | null
	status: TaxFeeStatus
	editingState?: TaxFeeEditingState
	currentVersionId?: string | null
	createdAt: Date
	updatedAt: Date
}

export type TaxFeeAssignment = {
	id: string
	taxFeeDefinitionId: string
	scope: TaxFeeScope
	scopeId: string | null
	channel: string | null
	status: TaxFeeStatus
	effectiveFrom?: Date | null
	effectiveTo?: Date | null
	createdAt: Date
}

export type TaxFeeSource = {
	scope: TaxFeeScope
	scopeId: string | null
	definitionId: string
}

export type ResolvedTaxFeeDefinition = {
	definition: TaxFeeDefinition
	source: TaxFeeSource
}

export type TaxFeeLine = {
	definitionId: string
	code: string
	name: string
	kind: TaxFeeKind
	calculationType: TaxFeeCalculationType
	value: number
	currency: string | null
	inclusionType: TaxFeeInclusionType
	appliesPer: TaxFeeAppliesPer
	priority: number
	amount: number
	collectionResponsibility: TaxFeeCollectionResponsibility
	taxableBase: TaxFeeTaxableBase
	source: TaxFeeSource
}

export type TaxFeeBreakdown = {
	base: number
	taxes: { included: TaxFeeLine[]; excluded: TaxFeeLine[] }
	fees: { included: TaxFeeLine[]; excluded: TaxFeeLine[] }
	total: number
}
