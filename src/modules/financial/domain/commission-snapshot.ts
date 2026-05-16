/**
 * Stage 4 commission snapshot.
 *
 * The basis must come from persisted booking contract snapshots, never pricing runtime.
 */
export type CommissionSnapshot = {
	id: string
	bookingId: string
	providerId: string
	commissionRate: number
	commissionAmount: number
	basis: "booking_room_detail_snapshot"
	currency: string
	snapshotAt: Date
	createdAt: Date
}
