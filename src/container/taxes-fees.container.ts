import {
	resolveEffectiveTaxFees,
	createTaxFeeDefinition,
	assignTaxFee,
	snapshotTaxFeesForBooking,
	listTaxFeeDefinitionsByProvider,
	listTaxFeeAssignmentsByScope,
	updateTaxFeeDefinition,
} from "@/modules/taxes-fees/public"
import { TaxFeeRepository } from "@/modules/taxes-fees/infrastructure/repositories/TaxFeeRepository"
import { BookingTaxFeeRepository } from "@/modules/taxes-fees/infrastructure/repositories/BookingTaxFeeRepository"

export const taxFeeDefinitionRepository = new TaxFeeRepository()
export const bookingTaxFeeRepository = new BookingTaxFeeRepository()

export async function resolveEffectiveTaxFeesUseCase(
	params: Parameters<typeof resolveEffectiveTaxFees>[1]
) {
	return resolveEffectiveTaxFees({ repo: taxFeeDefinitionRepository }, params)
}

export async function createTaxFeeDefinitionUseCase(
	params: Parameters<typeof createTaxFeeDefinition>[1]
) {
	return createTaxFeeDefinition({ repo: taxFeeDefinitionRepository }, params)
}

export async function assignTaxFeeUseCase(params: Parameters<typeof assignTaxFee>[1]) {
	return assignTaxFee({ repo: taxFeeDefinitionRepository }, params)
}

export async function updateTaxFeeDefinitionUseCase(
	params: Parameters<typeof updateTaxFeeDefinition>[1]
) {
	return updateTaxFeeDefinition({ repo: taxFeeDefinitionRepository }, params)
}

export async function snapshotTaxFeesForBookingUseCase(
	params: Parameters<typeof snapshotTaxFeesForBooking>[1]
) {
	return snapshotTaxFeesForBooking({ repo: bookingTaxFeeRepository }, params)
}

export async function listTaxFeeDefinitionsByProviderUseCase(
	params: Parameters<typeof listTaxFeeDefinitionsByProvider>[1]
) {
	return listTaxFeeDefinitionsByProvider({ repo: taxFeeDefinitionRepository }, params)
}

export async function listTaxFeeAssignmentsByScopeUseCase(
	params: Parameters<typeof listTaxFeeAssignmentsByScope>[1]
) {
	return listTaxFeeAssignmentsByScope({ repo: taxFeeDefinitionRepository }, params)
}
