export type SettlementRecordStatus = "pending" | "recorded" | "duplicate" | "failed"

export type SettlementRecord = {
	id: string
	bookingId: string
	providerId: string
	idempotencyKey: string
	grossAmount: number
	netAmount: number
	commissionAmount: number
	currency: string
	status: SettlementRecordStatus
}
