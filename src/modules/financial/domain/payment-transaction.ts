/**
 * Stage 3 PSP evidence identity.
 *
 * PaymentTransaction stores operational visibility of PSP/imported transaction evidence. It is not
 * a PSP execution command, does not move money, and must not be backed by the legacy Payment table.
 */
export const PAYMENT_TRANSACTION_TYPES = [
	"intent",
	"authorization",
	"capture",
	"void",
	"refund",
] as const
export const PAYMENT_TRANSACTION_STATUSES = [
	"created",
	"visible",
	"recorded",
	"failed",
	"cancelled",
	"unknown",
] as const

export type PaymentTransactionType = (typeof PAYMENT_TRANSACTION_TYPES)[number]
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number]
export type PaymentTransactionSource = "import" | "operator_entry" | "financial_shadow_bridge"

export type PaymentTransaction = {
	id: string
	bookingId: string
	providerId: string
	type: PaymentTransactionType
	status: PaymentTransactionStatus
	amount: number
	currency: string
	externalReference: string
	pspProvider: string
	idempotencyKey: string
	occurredAt: Date
	source: PaymentTransactionSource
	createdAt: Date
	updatedAt: Date
}
