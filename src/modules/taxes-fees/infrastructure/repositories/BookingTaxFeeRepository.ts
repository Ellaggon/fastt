import { BookingTaxFee, db, eq } from "astro:db"
import type {
	BookingTaxFeeRepositoryPort,
	BookingTaxFeeRow,
} from "../../application/ports/BookingTaxFeeRepositoryPort"

export class BookingTaxFeeRepository implements BookingTaxFeeRepositoryPort {
	async insertMany(rows: BookingTaxFeeRow[]): Promise<void> {
		if (!rows.length) return
		await db.transaction(async (tx) => {
			for (const row of rows) {
				await tx.insert(BookingTaxFee).values({
					id: row.id,
					bookingId: row.bookingId,
					lineJson: row.lineJson ?? null,
					breakdownJson: row.breakdownJson,
					totalAmount: row.totalAmount,
					createdAt: row.createdAt,
				})
			}
		})
	}

	async findByBookingId(bookingId: string): Promise<BookingTaxFeeRow[]> {
		const rows = await db
			.select()
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()
		return rows.map((row) => ({
			id: row.id,
			bookingId: row.bookingId,
			lineJson: row.lineJson ?? null,
			breakdownJson: row.breakdownJson,
			totalAmount: Number(row.totalAmount ?? 0),
			createdAt: row.createdAt ?? new Date(0),
		}))
	}
}
