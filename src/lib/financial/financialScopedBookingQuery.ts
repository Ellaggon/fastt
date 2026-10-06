import type { SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import {
	and,
	Booking,
	BookingLineItem,
	db,
	desc,
	eq,
	inArray,
	lt,
	or,
} from "@/shared/infrastructure/db/compat"

import type { FinancialApiProductFilter } from "@/lib/financial/financialApiProductScope"

/** Minimal database surface so callers (and relational tests) can run inside a transaction. */
export type FinancialScopedDatabase = Pick<typeof db, "select">

export type FinancialBookingPageCursor = {
	confirmedAt: Date
	id: string
}

export function parseFinancialBookingCursor(
	value: string | null
): FinancialBookingPageCursor | null {
	if (!value) return null
	const [time, id] = value.split("|")
	const confirmedAt = new Date(Number(time))
	if (!id || Number.isNaN(confirmedAt.getTime())) return null
	return { confirmedAt, id }
}

export function financialBookingCursorFromRow(row: {
	bookingId: unknown
	confirmedAt?: unknown
}): string | null {
	const date = row.confirmedAt ? new Date(String(row.confirmedAt)) : null
	if (!date || Number.isNaN(date.getTime())) return null
	return `${date.getTime()}|${String(row.bookingId)}`
}

function bookingIdsForProductFilterSubquery(
	productFilter: string[],
	database: FinancialScopedDatabase = db
) {
	return database
		.select({ bookingId: BookingLineItem.bookingId })
		.from(BookingLineItem)
		.where(inArray(BookingLineItem.productIdSnapshot, productFilter))
}

export function bookingMatchesProductFilterPredicate(
	productFilter: FinancialApiProductFilter,
	database: FinancialScopedDatabase = db
): SQL | null {
	if (productFilter === null) return null
	if (productFilter.length === 0) return eq(Booking.id, "__none__")
	return inArray(Booking.id, bookingIdsForProductFilterSubquery(productFilter, database))
}

export async function listScopedProviderBookingIdPage(input: {
	providerId: string
	productFilter: FinancialApiProductFilter
	cursor: FinancialBookingPageCursor | null
	limit: number
	database?: FinancialScopedDatabase
}): Promise<{
	rows: Array<{ bookingId: string; confirmedAt: unknown }>
	hasMore: boolean
	nextCursor: string | null
}> {
	const database = input.database ?? db
	const limit = Math.max(1, input.limit)
	if (input.productFilter !== null && input.productFilter.length === 0) {
		return { rows: [], hasMore: false, nextCursor: null }
	}

	const bookingPredicates = [eq(Booking.providerId, input.providerId)]
	const productPredicate = bookingMatchesProductFilterPredicate(input.productFilter, database)
	if (productPredicate) bookingPredicates.push(productPredicate)
	if (input.cursor) {
		bookingPredicates.push(
			or(
				lt(Booking.confirmedAt, input.cursor.confirmedAt),
				and(eq(Booking.confirmedAt, input.cursor.confirmedAt), lt(Booking.id, input.cursor.id))
			)!
		)
	}

	const bookingIdRows = await database
		.select({ bookingId: Booking.id, confirmedAt: Booking.confirmedAt })
		.from(Booking)
		.where(and(...bookingPredicates))
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
		.limit(limit + 1)

	const hasMore = bookingIdRows.length > limit
	const rows = bookingIdRows.slice(0, limit).map((row) => ({
		bookingId: String(row.bookingId),
		confirmedAt: row.confirmedAt,
	}))
	const nextCursor =
		hasMore && rows.length ? financialBookingCursorFromRow(rows[rows.length - 1]) : null
	return { rows, hasMore, nextCursor }
}

/** Predicate for any table whose `bookingId` column must respect the active product scope. */
export function bookingIdMatchesProductFilter(
	bookingIdColumn: AnyPgColumn,
	productFilter: FinancialApiProductFilter,
	database: FinancialScopedDatabase = db
): SQL | null {
	if (productFilter === null) return null
	if (productFilter.length === 0) return eq(bookingIdColumn, "__none__")
	return inArray(bookingIdColumn, bookingIdsForProductFilterSubquery(productFilter, database))
}
