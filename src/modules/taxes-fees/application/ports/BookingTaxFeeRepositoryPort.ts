export type BookingTaxFeeRow = {
	id: string
	bookingId: string
	lineJson: unknown | null
	breakdownJson: unknown
	totalAmount: number
	createdAt: Date
}

export interface BookingTaxFeeRepositoryPort {
	insertMany(rows: BookingTaxFeeRow[]): Promise<void>
	findByBookingId(bookingId: string): Promise<BookingTaxFeeRow[]>
}
