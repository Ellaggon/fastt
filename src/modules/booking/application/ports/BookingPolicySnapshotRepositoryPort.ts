export type BookingPolicySnapshotRow = {
	id: string
	bookingId: string
	category: string
	policyId: string
	policySnapshotJson: unknown
	createdAt: Date
}

export interface BookingPolicySnapshotRepositoryPort {
	listByBookingId(bookingId: string): Promise<BookingPolicySnapshotRow[]>
	// Canonical read method for booking-time policy snapshots.
	// Kept separate from listByBookingId to allow later changes (pagination, filtering) without churn.
	findByBookingId(bookingId: string): Promise<BookingPolicySnapshotRow[]>
	insertMany(rows: BookingPolicySnapshotRow[]): Promise<void>
}
