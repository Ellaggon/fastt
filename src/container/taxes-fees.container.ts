import { createTaxesFeesRuntime } from "@/modules/taxes-fees/public"

const runtime = createTaxesFeesRuntime()

export const resolveEffectiveTaxFeesUseCase = runtime.resolveEffectiveTaxFeesUseCase
export const createTaxFeeDefinitionUseCase = runtime.createTaxFeeDefinitionUseCase
export const assignTaxFeeUseCase = runtime.assignTaxFeeUseCase
export const updateTaxFeeDefinitionUseCase = runtime.updateTaxFeeDefinitionUseCase
export const snapshotTaxFeesForBookingUseCase = runtime.snapshotTaxFeesForBookingUseCase
export const listTaxFeeDefinitionsByProviderUseCase = runtime.listTaxFeeDefinitionsByProviderUseCase
export const listTaxFeeAssignmentsByScopeUseCase = runtime.listTaxFeeAssignmentsByScopeUseCase
