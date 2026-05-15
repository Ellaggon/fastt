import type { LegacyPaymentIntentShadow } from "../../domain/payment-intent"
import type { LegacySettlementShadow } from "../../domain/settlement-record"

export type FinancialEventPublisherPort = {
	publishFinancialShadowIntent(event: {
		bookingId: string
		paymentIntent: LegacyPaymentIntentShadow
		settlementRecord: LegacySettlementShadow
	}): Promise<void>
}
