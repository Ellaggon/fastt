import { registerFinancialShadowWrite } from "@/modules/financial/application/use-cases/register-financial-shadow-write"
import { FinancialExceptionRepository } from "@/modules/financial/infrastructure/repositories/FinancialExceptionRepository"
import { FinancialReferenceRepository } from "@/modules/financial/infrastructure/repositories/FinancialReferenceRepository"
import { FinancialRepository } from "@/modules/financial/infrastructure/repositories/FinancialRepository"
import { FinancialReviewEventRepository } from "@/modules/financial/infrastructure/repositories/FinancialReviewEventRepository"
import { RefundHandoffRepository } from "@/modules/financial/infrastructure/repositories/RefundHandoffRepository"
import type { RegisterFinancialShadowWriteInput } from "@/modules/financial/public"

export const financialRepository = new FinancialRepository()
export const financialExceptionRepository = new FinancialExceptionRepository()
export const financialReferenceRepository = new FinancialReferenceRepository()
export const refundHandoffRepository = new RefundHandoffRepository()
export const financialReviewEventRepository = new FinancialReviewEventRepository()

export function registerFinancialShadowWriteUseCase(input: RegisterFinancialShadowWriteInput) {
	return registerFinancialShadowWrite(input)
}
