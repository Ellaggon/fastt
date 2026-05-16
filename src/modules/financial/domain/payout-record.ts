/**
 * Stage 4 payout reference visibility.
 *
 * PayoutRecord is a review/reference artifact. It does not send money, settle funds, or represent
 * bank execution.
 */
export const PAYOUT_RECORD_STATUSES = [
	"eligible",
	"blocked",
	"pending_reference",
	"recorded",
	"unknown",
] as const

export type PayoutRecordStatus = (typeof PAYOUT_RECORD_STATUSES)[number]

export type PayoutRecord = {
	id: string
	bookingId?: string | null
	providerId: string
	status: PayoutRecordStatus
	payoutReference?: string | null
	amount?: number | null
	currency?: string | null
	basis: "provider_payable_visibility"
	recordedAt?: Date | null
	createdAt: Date
	updatedAt: Date
}
