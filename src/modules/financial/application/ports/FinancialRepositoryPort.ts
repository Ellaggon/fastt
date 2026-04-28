import type { PaymentIntent } from "../../domain/payment-intent"
import type { RefundRecord } from "../../domain/refund-record"
import type { SettlementRecord } from "../../domain/settlement-record"

export type FinancialSaveResult = "created" | "already_exists"

export type FinancialRepositoryPort = {
	savePaymentIntentIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: PaymentIntent
	}): Promise<FinancialSaveResult>
	saveSettlementRecordIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: SettlementRecord
	}): Promise<FinancialSaveResult>
	saveRefundRecordIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: RefundRecord
	}): Promise<FinancialSaveResult>
	findPaymentIntentByIdempotencyKey(idempotencyKey: string): Promise<PaymentIntent | null>
	findByBookingId(bookingId: string): Promise<{
		paymentIntents: PaymentIntent[]
		settlementRecords: SettlementRecord[]
		refundRecords: RefundRecord[]
	}>
}
