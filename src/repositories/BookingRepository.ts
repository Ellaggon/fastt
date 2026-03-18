import { db, Booking as BookingTable } from "astro:db"

export class BookingRepository {
	async create(data: any) {
		await db.insert(BookingTable).values(data)
	}
}
