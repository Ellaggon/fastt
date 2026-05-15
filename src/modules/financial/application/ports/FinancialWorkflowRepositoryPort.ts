import type {
	FinancialExceptionCode,
	FinancialExceptionRecord,
	FinancialExceptionStatus,
} from "../../domain/financial-exception-record"
import type { FinancialReference, FinancialReferenceType } from "../../domain/financial-reference"
import type { FinancialReviewEvent } from "../../domain/financial-review-event"
import type { RefundHandoffRecord } from "../../domain/refund-handoff-record"

export type FinancialExceptionCreateInput = Omit<
	FinancialExceptionRecord,
	"id" | "createdAt" | "updatedAt"
> & { id?: string }
export type FinancialReferenceCreateInput = Omit<FinancialReference, "id" | "createdAt"> & {
	id?: string
}
export type RefundHandoffCreateInput = Omit<
	RefundHandoffRecord,
	"id" | "createdAt" | "updatedAt"
> & {
	id?: string
}
export type FinancialReviewEventCreateInput = Omit<FinancialReviewEvent, "id" | "createdAt"> & {
	id?: string
}

export type FinancialExceptionRepositoryPort = {
	findByProvider(params: {
		providerId: string
		status?: FinancialExceptionStatus | "all"
		code?: FinancialExceptionCode | "all"
		nextOwner?: string | "all"
		bookingId?: string
		limit?: number
	}): Promise<FinancialExceptionRecord[]>
	findByIdForProvider(id: string, providerId: string): Promise<FinancialExceptionRecord | null>
	findByBookingAndCode(params: {
		bookingId: string
		code: FinancialExceptionCode
	}): Promise<FinancialExceptionRecord[]>
	create(input: FinancialExceptionCreateInput): Promise<FinancialExceptionRecord>
	acknowledge(params: {
		id: string
		providerId: string
		acknowledgedAt: Date
	}): Promise<FinancialExceptionRecord | null>
	resolve(params: {
		id: string
		providerId: string
		resolvedAt: Date
		resolvedBy: string
		resolutionNote: string
		status: Extract<FinancialExceptionStatus, "resolved" | "dismissed">
	}): Promise<FinancialExceptionRecord | null>
}

export type FinancialReferenceRepositoryPort = {
	findByBookingId(bookingId: string): Promise<FinancialReference[]>
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		limit?: number
	}): Promise<FinancialReference[]>
	findExisting(params: {
		providerId: string
		bookingId: string
		type: FinancialReferenceType
		referenceValue: string
		externalSystem?: string | null
	}): Promise<FinancialReference | null>
	createIfAbsent(input: FinancialReferenceCreateInput): Promise<{
		reference: FinancialReference
		created: boolean
	}>
}

export type RefundHandoffRepositoryPort = {
	findByIdForProvider(id: string, providerId: string): Promise<RefundHandoffRecord | null>
	findByBookingId(bookingId: string): Promise<RefundHandoffRecord[]>
	findByProvider(params: {
		providerId: string
		bookingIds?: string[]
		status?: RefundHandoffRecord["status"] | "all"
		limit?: number
	}): Promise<RefundHandoffRecord[]>
	findActiveByBookingId(bookingId: string, providerId: string): Promise<RefundHandoffRecord | null>
	createIfAbsent(input: RefundHandoffCreateInput): Promise<{
		handoff: RefundHandoffRecord
		created: boolean
	}>
	createIfAbsentForBooking(input: RefundHandoffCreateInput): Promise<{
		handoff: RefundHandoffRecord
		created: boolean
	}>
	acknowledge(params: {
		id: string
		providerId: string
		acknowledgedAt: Date
	}): Promise<RefundHandoffRecord | null>
	close(params: {
		id: string
		providerId: string
		closedAt: Date
		notes: string
		status: Extract<RefundHandoffRecord["status"], "closed" | "dismissed">
	}): Promise<RefundHandoffRecord | null>
}

export type FinancialReviewEventRepositoryPort = {
	append(input: FinancialReviewEventCreateInput): Promise<FinancialReviewEvent>
	findByProvider(params: {
		providerId: string
		bookingId?: string
		financialExceptionId?: string
		refundHandoffId?: string
		reconciliationMatchId?: string
		limit?: number
	}): Promise<FinancialReviewEvent[]>
}
