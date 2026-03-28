import { db, BookingPolicySnapshot, eq } from "astro:db"
import type {
	BookingPolicySnapshotRepositoryPort,
	BookingPolicySnapshotRow,
} from "../../application/ports/BookingPolicySnapshotRepositoryPort"

export class BookingPolicySnapshotRepository implements BookingPolicySnapshotRepositoryPort {
	async listByBookingId(bookingId: string): Promise<BookingPolicySnapshotRow[]> {
		const id = String(bookingId ?? "").trim()
		if (!id) return []

		const rows = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, id))
		return rows.map((r: any) => ({
			id: String(r.id),
			bookingId: String(r.bookingId),
			category: String(r.category ?? ""),
			policyId: String(r.policyId ?? ""),
			policySnapshotJson: r.policySnapshotJson ?? null,
			createdAt: r.createdAt ? new Date(r.createdAt) : new Date(0),
		}))
	}

	async findByBookingId(bookingId: string): Promise<BookingPolicySnapshotRow[]> {
		return this.listByBookingId(bookingId)
	}

	async insertMany(rows: BookingPolicySnapshotRow[]): Promise<void> {
		if (!rows.length) return
		await db.transaction(async (tx) => {
			for (const r of rows) {
				await tx.insert(BookingPolicySnapshot).values({
					id: r.id,
					bookingId: r.bookingId,
					// Legacy fields left blank for CAPA 6 snapshot rows.
					policyType: r.category,
					description: "",
					cancellationJson: null,
					category: r.category,
					policyId: r.policyId,
					policySnapshotJson: r.policySnapshotJson as any,
					createdAt: r.createdAt,
				} as any)
			}
		})
	}
}
