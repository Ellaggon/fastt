import type { FinancialSettlementRecord } from "../../domain/financial-settlement-record"
import type { PaymentAttempt } from "../../domain/payment-attempt"
import type { PaymentTransaction, PaymentTransactionType } from "../../domain/payment-transaction"
import type { ReconciliationMatch } from "../../domain/reconciliation-match"

export type PaymentTransactionCreateInput = Omit<
	PaymentTransaction,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string
}
export type PaymentAttemptCreateInput = Omit<PaymentAttempt, "id" | "createdAt"> & { id?: string }
export type FinancialSettlementRecordCreateInput = Omit<
	FinancialSettlementRecord,
	"id" | "createdAt"
> & {
	id?: string
}
export type ReconciliationMatchCreateInput = Omit<
	ReconciliationMatch,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string
}

export type PaymentTransactionRepositoryPort = {
	findByBookingId(bookingId: string): Promise<PaymentTransaction[]>
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		type?: PaymentTransactionType | "all"
		limit?: number
	}): Promise<PaymentTransaction[]>
	findUnmatchedByProvider(params: {
		providerId: string
		limit?: number
	}): Promise<PaymentTransaction[]>
	findExisting(params: {
		providerId: string
		pspProvider: string
		externalReference: string
		type: PaymentTransactionType
	}): Promise<PaymentTransaction | null>
	createIfAbsent(input: PaymentTransactionCreateInput): Promise<{
		transaction: PaymentTransaction
		created: boolean
	}>
	findDuplicateExternalReferences(
		providerId: string
	): Promise<
		Array<{ pspProvider: string; externalReference: string; count: number; bookingIds: string[] }>
	>
}

export type PaymentAttemptRepositoryPort = {
	findByTransactionId(paymentTransactionId: string): Promise<PaymentAttempt[]>
	create(input: PaymentAttemptCreateInput): Promise<PaymentAttempt>
}

export type FinancialSettlementRecordRepositoryPort = {
	findByBookingId(bookingId: string): Promise<FinancialSettlementRecord[]>
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<FinancialSettlementRecord[]>
	findUnmatchedByProvider(params: {
		providerId: string
		limit?: number
	}): Promise<FinancialSettlementRecord[]>
	findExisting(params: {
		providerId: string
		settlementReference: string
	}): Promise<FinancialSettlementRecord | null>
	createIfAbsent(input: FinancialSettlementRecordCreateInput): Promise<{
		settlement: FinancialSettlementRecord
		created: boolean
	}>
}

export type ReconciliationMatchRepositoryPort = {
	findByBookingId(bookingId: string): Promise<ReconciliationMatch | null>
	findByBookingIdForProvider(
		bookingId: string,
		providerId: string
	): Promise<ReconciliationMatch | null>
	findByProvider(params: {
		providerId: string
		status?: ReconciliationMatch["status"] | "all"
		reviewStatus?: ReconciliationMatch["reviewStatus"] | "all"
		limit?: number
	}): Promise<ReconciliationMatch[]>
	createOrUpdate(input: ReconciliationMatchCreateInput): Promise<ReconciliationMatch>
	markReviewed(params: {
		id: string
		providerId: string
		reviewedBy: string
		reviewNote?: string | null
	}): Promise<ReconciliationMatch | null>
}
