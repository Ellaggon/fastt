import type { PaymentIntent } from "../../domain/payment-intent"
import type { SettlementRecord } from "../../domain/settlement-record"

export type FinancialEventPublisherPort = {
	publishFinancialShadowIntent(event: {
		bookingId: string
		paymentIntent: PaymentIntent
		settlementRecord: SettlementRecord
	}): Promise<void>
}
