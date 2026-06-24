/**
 * Stage 4 commission snapshot.
 *
 * The basis must come from persisted booking contract snapshots, never pricing runtime.
 *
 * TODO(Stage 4 follow-up): persist minimal version, provenance, superseded, and invalidation
 * metadata only after the operational workflow proves it is needed. Do not expand this into
 * mutable financial truth or an accounting lifecycle.
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
