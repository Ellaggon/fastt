export type PaymentIntentStatus = "pending" | "recorded" | "duplicate" | "failed"

export type PaymentIntent = {
	id: string
	bookingId: string
	amount: number
	currency: string
	status: PaymentIntentStatus
	source: string
	idempotencyKey: string
	metadata?: Record<string, unknown>
}
