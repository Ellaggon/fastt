import type { TaxFeePort } from "../../application/ports/TaxFeePort"
import type {
	ResolvedTaxFeeDefinition,
	TaxFeeBreakdown,
} from "@/modules/taxes-fees/domain/tax-fee.types"

export class TaxFeePortAdapter implements TaxFeePort {
	constructor(
		private deps: {
			resolveEffectiveTaxFees: (params: {
				productId?: string
				variantId?: string
				ratePlanId?: string
				channel?: string | null
			}) => Promise<{ definitions: ResolvedTaxFeeDefinition[] }>
			computeTaxBreakdown: (params: {
				base: number
				definitions: ResolvedTaxFeeDefinition[]
				nights: number
				guests: number
			}) => TaxFeeBreakdown
		}
	) {}

	resolveEffectiveTaxFees(params: {
		productId?: string
		variantId?: string
		ratePlanId?: string
		channel?: string | null
	}) {
		return this.deps.resolveEffectiveTaxFees(params)
	}

	computeTaxBreakdown(params: {
		base: number
		definitions: ResolvedTaxFeeDefinition[]
		nights: number
		guests: number
	}) {
		return this.deps.computeTaxBreakdown(params)
	}
}
