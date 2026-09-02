import {
	asc,
	and,
	Booking,
	BookingLineItem,
	db,
	desc,
	eq,
	inArray,
	or,
	sql,
} from "@/shared/infrastructure/db/compat"

import type {
	FinancialBookingCandidate,
	FinancialBookingCandidateRepositoryPort,
} from "../../application/ports/FinancialBookingCandidateRepositoryPort"

function normalizedSearch(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es")
		.trim()
}

function isDateSearch(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Read-only lookup used only while reconciling imported financial evidence.
 * Provider scope is part of the query rather than a post-filter so a candidate
 * from another account can never reach the browser.
 */
export class FinancialBookingCandidateRepository implements FinancialBookingCandidateRepositoryPort {
	constructor(private readonly database: Pick<typeof db, "select" | "selectDistinctOn"> = db) {}

	async search(params: {
		providerId: string
		query: string
		limit: number
	}): Promise<FinancialBookingCandidate[]> {
		const query = normalizedSearch(params.query)
		const dateSearch = isDateSearch(query)
		const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`
		const prefixPattern = `${query.replace(/[%_\\]/g, "\\$&")}%`
		const candidatePredicate = !query
			? undefined
			: dateSearch
				? or(eq(Booking.checkInDate, query), eq(Booking.checkOutDate, query))
				: sql`(
					public.fastt_search_normalize(${Booking.id}) LIKE ${pattern} ESCAPE '\\'
					OR public.fastt_search_normalize(coalesce(${Booking.externalBookingId}, '')) LIKE ${pattern} ESCAPE '\\'
					OR public.fastt_search_normalize(coalesce(${Booking.guestNameSnapshot}, '')) LIKE ${pattern} ESCAPE '\\'
					OR public.fastt_search_normalize(coalesce(${Booking.guestEmailSnapshot}, '')) LIKE ${pattern} ESCAPE '\\'
					OR EXISTS (
						SELECT 1
						FROM "BookingLineItem" AS candidate_item
						WHERE candidate_item."bookingId" = ${Booking.id}
							AND (
								public.fastt_search_normalize(coalesce(candidate_item."productNameSnapshot", '')) LIKE ${pattern} ESCAPE '\\'
								OR public.fastt_search_normalize(coalesce(candidate_item."variantNameSnapshot", '')) LIKE ${pattern} ESCAPE '\\'
							)
					)
				)`
		const relevance = !query
			? sql`CASE WHEN true THEN 0 ELSE 0 END`
			: dateSearch
				? sql`CASE
					WHEN ${Booking.checkInDate} = ${query} THEN 0
					WHEN ${Booking.checkOutDate} = ${query} THEN 1
					ELSE 2
				END`
				: sql`CASE
					WHEN public.fastt_search_normalize(${Booking.id}) = ${query} THEN 0
					WHEN public.fastt_search_normalize(coalesce(${Booking.externalBookingId}, '')) = ${query} THEN 0
					WHEN public.fastt_search_normalize(coalesce(${Booking.externalBookingId}, '')) LIKE ${prefixPattern} ESCAPE '\\' THEN 1
					WHEN public.fastt_search_normalize(coalesce(${Booking.guestEmailSnapshot}, '')) = ${query} THEN 1
					WHEN public.fastt_search_normalize(coalesce(${Booking.guestNameSnapshot}, '')) LIKE ${prefixPattern} ESCAPE '\\' THEN 2
					ELSE 3
				END`

		const rows = await this.database
			.select({
				id: Booking.id,
				guestName: Booking.guestNameSnapshot,
				guestEmail: Booking.guestEmailSnapshot,
				checkIn: Booking.checkInDate,
				checkOut: Booking.checkOutDate,
				currency: Booking.currency,
				totalAmount: Booking.totalAmount,
				status: Booking.status,
				externalBookingId: Booking.externalBookingId,
			})
			.from(Booking)
			.where(and(eq(Booking.providerId, params.providerId), candidatePredicate))
			.orderBy(relevance, desc(Booking.confirmedAt), desc(Booking.bookingDate), desc(Booking.id))
			.limit(params.limit)
		const bookingIds = rows.map((row) => row.id)
		const lineRelevance =
			query && !dateSearch
				? sql`CASE
				WHEN public.fastt_search_normalize(coalesce(${BookingLineItem.productNameSnapshot}, '')) LIKE ${pattern} ESCAPE '\\' THEN 0
				WHEN public.fastt_search_normalize(coalesce(${BookingLineItem.variantNameSnapshot}, '')) LIKE ${pattern} ESCAPE '\\' THEN 0
				ELSE 1
			END`
				: sql`CASE WHEN true THEN 0 ELSE 0 END`
		const lineItems = bookingIds.length
			? await this.database
					.selectDistinctOn([BookingLineItem.bookingId], {
						bookingId: BookingLineItem.bookingId,
						productName: BookingLineItem.productNameSnapshot,
						variantName: BookingLineItem.variantNameSnapshot,
					})
					.from(BookingLineItem)
					.where(inArray(BookingLineItem.bookingId, bookingIds))
					.orderBy(
						asc(BookingLineItem.bookingId),
						lineRelevance,
						asc(BookingLineItem.createdAt),
						asc(BookingLineItem.id)
					)
			: []
		const displayLineByBooking = new Map(
			lineItems.map((line) => [
				line.bookingId,
				{ productName: line.productName, variantName: line.variantName },
			])
		)

		return rows.map<FinancialBookingCandidate>((row) => ({
			id: String(row.id),
			guestName: row.guestName == null ? null : String(row.guestName),
			guestEmail: row.guestEmail == null ? null : String(row.guestEmail),
			productName: displayLineByBooking.get(row.id)?.productName ?? null,
			variantName: displayLineByBooking.get(row.id)?.variantName ?? null,
			checkIn: row.checkIn == null ? null : String(row.checkIn),
			checkOut: row.checkOut == null ? null : String(row.checkOut),
			currency: String(row.currency || ""),
			totalAmount: Number(row.totalAmount || 0),
			status: String(row.status || ""),
			externalBookingId: row.externalBookingId == null ? null : String(row.externalBookingId),
		}))
	}
}
