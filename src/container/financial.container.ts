import { registerFinancialShadowWrite } from "@/modules/financial/application/use-cases/register-financial-shadow-write"
import { FinancialExceptionRepository } from "@/modules/financial/infrastructure/repositories/FinancialExceptionRepository"
import { FinancialReferenceRepository } from "@/modules/financial/infrastructure/repositories/FinancialReferenceRepository"
import { FinancialRepository } from "@/modules/financial/infrastructure/repositories/FinancialRepository"
import { FinancialReviewEventRepository } from "@/modules/financial/infrastructure/repositories/FinancialReviewEventRepository"
import { FinancialSettlementRecordRepository } from "@/modules/financial/infrastructure/repositories/FinancialSettlementRecordRepository"
import { PaymentAttemptRepository } from "@/modules/financial/infrastructure/repositories/PaymentAttemptRepository"
import { PaymentTransactionRepository } from "@/modules/financial/infrastructure/repositories/PaymentTransactionRepository"
import { ReconciliationMatchRepository } from "@/modules/financial/infrastructure/repositories/ReconciliationMatchRepository"
import { RefundHandoffRepository } from "@/modules/financial/infrastructure/repositories/RefundHandoffRepository"
import type { RegisterFinancialShadowWriteInput } from "@/modules/financial/public"

export const financialRepository = new FinancialRepository()
export const financialExceptionRepository = new FinancialExceptionRepository()
export const financialReferenceRepository = new FinancialReferenceRepository()
export const refundHandoffRepository = new RefundHandoffRepository()
export const financialReviewEventRepository = new FinancialReviewEventRepository()
export const paymentTransactionRepository = new PaymentTransactionRepository()
export const paymentAttemptRepository = new PaymentAttemptRepository()
export const financialSettlementRecordRepository = new FinancialSettlementRecordRepository()
export const reconciliationMatchRepository = new ReconciliationMatchRepository()

export function registerFinancialShadowWriteUseCase(input: RegisterFinancialShadowWriteInput) {
	return registerFinancialShadowWrite(input)
}
