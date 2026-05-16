/**
 * Stage 4 provider payable snapshot.
 *
 * This explains payable visibility from contract snapshots and Stage 3 evidence. It is not payout
 * execution, accounting, or ledger state.
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
