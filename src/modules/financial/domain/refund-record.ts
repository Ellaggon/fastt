export type RefundRecordStatus = "pending" | "recorded" | "duplicate" | "failed"

export type RefundRecord = {
	id: string
	bookingId: string
	idempotencyKey: string
	amount: number
	currency: string
	reason: string
	status: RefundRecordStatus
}
