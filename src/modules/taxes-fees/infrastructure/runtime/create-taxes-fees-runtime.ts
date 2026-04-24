import { assignTaxFee } from "../../application/use-cases/assign-tax-fee"
import { createTaxFeeDefinition } from "../../application/use-cases/create-tax-fee-definition"
import { listTaxFeeAssignmentsByScope } from "../../application/use-cases/list-tax-fee-assignments"
import { listTaxFeeDefinitionsByProvider } from "../../application/use-cases/list-tax-fee-definitions"
import { resolveEffectiveTaxFees } from "../../application/use-cases/resolve-effective-tax-fees"
import { snapshotTaxFeesForBooking } from "../../application/use-cases/snapshot-tax-fees-for-booking"
import { updateTaxFeeDefinition } from "../../application/use-cases/update-tax-fee-definition"
import { BookingTaxFeeRepository } from "../repositories/BookingTaxFeeRepository"
import { TaxFeeRepository } from "../repositories/TaxFeeRepository"

export function createTaxesFeesRuntime() {
	const taxFeeDefinitionRepository = new TaxFeeRepository()
	const bookingTaxFeeRepository = new BookingTaxFeeRepository()

	return {
		async resolveEffectiveTaxFeesUseCase(params: Parameters<typeof resolveEffectiveTaxFees>[1]) {
			return resolveEffectiveTaxFees({ repo: taxFeeDefinitionRepository }, params)
		},
		async createTaxFeeDefinitionUseCase(params: Parameters<typeof createTaxFeeDefinition>[1]) {
			return createTaxFeeDefinition({ repo: taxFeeDefinitionRepository }, params)
		},
		async assignTaxFeeUseCase(params: Parameters<typeof assignTaxFee>[1]) {
			return assignTaxFee({ repo: taxFeeDefinitionRepository }, params)
		},
		async updateTaxFeeDefinitionUseCase(params: Parameters<typeof updateTaxFeeDefinition>[1]) {
			return updateTaxFeeDefinition({ repo: taxFeeDefinitionRepository }, params)
		},
		async snapshotTaxFeesForBookingUseCase(
			params: Parameters<typeof snapshotTaxFeesForBooking>[1]
		) {
			return snapshotTaxFeesForBooking({ repo: bookingTaxFeeRepository }, params)
		},
		async listTaxFeeDefinitionsByProviderUseCase(
			params: Parameters<typeof listTaxFeeDefinitionsByProvider>[1]
		) {
			return listTaxFeeDefinitionsByProvider({ repo: taxFeeDefinitionRepository }, params)
		},
		async listTaxFeeAssignmentsByScopeUseCase(
			params: Parameters<typeof listTaxFeeAssignmentsByScope>[1]
		) {
			return listTaxFeeAssignmentsByScope({ repo: taxFeeDefinitionRepository }, params)
		},
	}
}
