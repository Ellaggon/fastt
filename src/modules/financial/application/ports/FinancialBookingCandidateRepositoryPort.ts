export type FinancialBookingCandidate = {
	id: string
	guestName: string | null
	guestEmail: string | null
	productName: string | null
	variantName: string | null
	checkIn: string | null
	checkOut: string | null
	currency: string
	totalAmount: number
	status: string
	externalBookingId: string | null
}

export interface FinancialBookingCandidateRepositoryPort {
	search(params: {
		providerId: string
		query: string
		limit: number
	}): Promise<FinancialBookingCandidate[]>
}
