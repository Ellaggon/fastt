/**
 * Stage 4 commission snapshot.
 *
 * The basis must come from persisted booking contract snapshots, never pricing runtime.
 *
 * TODO(Stage 4 follow-up): persist minimal version, provenance, superseded, and invalidation
 * metadata only after the operational workflow proves it is needed. Do not expand this into
 * mutable financial truth or an accounting lifecycle.
 */
import type { CommercialLine } from "@/lib/verification/commercial-lines"

export type CommissionSnapshot = {
	id: string
	bookingId: string
	providerId: string
	commercialLine: CommercialLine | null
	agreementVersion: string | null
	commissionRate: number
	commissionAmount: number
	basis: "booking_line_item_snapshot"
	currency: string
	snapshotAt: Date
	createdAt: Date
}
