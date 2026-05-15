import type { LegacyPaymentIntentShadow } from "../../domain/payment-intent"
import type { LegacyRefundShadow } from "../../domain/refund-record"
import type { LegacySettlementShadow } from "../../domain/settlement-record"

export type FinancialSaveResult = "created" | "already_exists"

export type FinancialRepositoryPort = {
	saveLegacyPaymentIntentShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacyPaymentIntentShadow
	}): Promise<FinancialSaveResult>
	saveLegacySettlementShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacySettlementShadow
	}): Promise<FinancialSaveResult>
	saveLegacyRefundShadowIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: LegacyRefundShadow
	}): Promise<FinancialSaveResult>
	findLegacyPaymentIntentShadowByIdempotencyKey(
		idempotencyKey: string
	): Promise<LegacyPaymentIntentShadow | null>
	findByBookingId(bookingId: string): Promise<{
		paymentIntents: LegacyPaymentIntentShadow[]
		settlementRecords: LegacySettlementShadow[]
		refundRecords: LegacyRefundShadow[]
	}>
}
