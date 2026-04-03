import type {
	ResolvedTaxFeeDefinition,
	TaxFeeBreakdown,
} from "@/modules/taxes-fees/domain/tax-fee.types"

export interface TaxFeePort {
	resolveEffectiveTaxFees(params: {
		productId?: string
		variantId?: string
		ratePlanId?: string
		channel?: string | null
	}): Promise<{ definitions: ResolvedTaxFeeDefinition[] }>
	computeTaxBreakdown(params: {
		base: number
		definitions: ResolvedTaxFeeDefinition[]
		nights: number
		guests: number
	}): TaxFeeBreakdown
}
