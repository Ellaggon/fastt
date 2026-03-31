export class BookingPolicySnapshotMissingError extends Error {
	public readonly code = "booking_policy_snapshot_missing" as const

	constructor(message = "booking_policy_snapshot_missing") {
		super(message)
	}
}
