/**
 * Stage 4 provider payable snapshot.
 *
 * This explains payable visibility from contract snapshots and Stage 3 evidence. It is not payout
 * execution, accounting, or ledger state.
 *
 * TODO(Stage 4 follow-up): persist minimal version, provenance, superseded, and invalidation
 * metadata only after the operational workflow proves it is needed. Keep this snapshot read-only.
 */
export type ProviderPayableSnapshot = {
	id: string
	bookingId: string
	providerId: string
	grossAmount: number
	commissionAmount: number
	taxAmount: number
	netPayable: number
	currency: string
	basis: "booking_room_detail_snapshot_commission_snapshot"
	snapshotAt: Date
	createdAt: Date
	updatedAt: Date
}
