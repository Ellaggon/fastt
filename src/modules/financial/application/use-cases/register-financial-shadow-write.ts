import type { PaymentIntent } from "../../domain/payment-intent"
import type { SettlementRecord } from "../../domain/settlement-record"

export type RegisterFinancialShadowWriteInput = {
	bookingId: string
	providerId: string
	grossAmount: number
	netAmount: number
	commissionAmount: number
	currency: string
	source: string
	idempotencyKey: string
	metadata?: Record<string, unknown>
}

export type RegisterFinancialShadowWriteResult = {
	bookingId: string
	paymentIntent: PaymentIntent
	settlementRecord: SettlementRecord
}

export async function registerFinancialShadowWrite(
	input: RegisterFinancialShadowWriteInput
): Promise<RegisterFinancialShadowWriteResult> {
	if (!Number.isFinite(input.grossAmount) || input.grossAmount <= 0) {
		throw new Error("FINANCIAL_INVALID_GROSS_AMOUNT")
	}
	if (!Number.isFinite(input.netAmount) || input.netAmount < 0) {
		throw new Error("FINANCIAL_INVALID_NET_AMOUNT")
	}
	if (!Number.isFinite(input.commissionAmount) || input.commissionAmount < 0) {
		throw new Error("FINANCIAL_INVALID_COMMISSION_AMOUNT")
	}
	if (input.grossAmount < input.netAmount) {
		throw new Error("FINANCIAL_INCONSISTENT_AMOUNTS")
	}
	const currency = String(input.currency ?? "").trim()
	if (!currency) {
		throw new Error("FINANCIAL_INVALID_CURRENCY")
	}

	const paymentIntent: PaymentIntent = {
		id: crypto.randomUUID(),
		bookingId: input.bookingId,
		amount: input.grossAmount,
		currency,
		status: "pending",
		source: input.source,
		idempotencyKey: input.idempotencyKey,
		metadata: input.metadata,
	}

	const settlementRecord: SettlementRecord = {
		id: crypto.randomUUID(),
		bookingId: input.bookingId,
		providerId: input.providerId,
		idempotencyKey: input.idempotencyKey,
		grossAmount: input.grossAmount,
		netAmount: input.netAmount,
		commissionAmount: input.commissionAmount,
		currency,
		status: "pending",
	}

	// Placeholder only: this use case builds financial intent contracts but
	// intentionally performs no persistence and no side effects in Phase 4.1.
	return {
		bookingId: input.bookingId,
		paymentIntent,
		settlementRecord,
	}
}
