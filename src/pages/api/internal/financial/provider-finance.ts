import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	desc,
	eq,
	inArray,
	lt,
	or,
	Product,
	Variant,
} from "astro:db"

import {
	commissionSnapshotRepository,
	financialSettlementRecordRepository,
	payoutRecordRepository,
	providerFinancialProfileRepository,
	providerPayableSnapshotRepository,
	providerStatementRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import { buildProviderFinanceSummary } from "@/modules/financial/public"

import { json, requireFinancialProvider } from "./_stage2"

type BookingCursor = {
	confirmedAt: Date
	id: string
}

function parseBookingCursor(value: string | null): BookingCursor | null {
	if (!value) return null
	const [time, id] = value.split("|")
	const confirmedAt = new Date(Number(time))
	if (!id || Number.isNaN(confirmedAt.getTime())) return null
	return { confirmedAt, id }
}

function bookingCursorFromRow(row: { bookingId: unknown; confirmedAt?: unknown }): string | null {
	const date = row.confirmedAt ? new Date(String(row.confirmedAt)) : null
	if (!date || Number.isNaN(date.getTime())) return null
	return `${date.getTime()}|${String(row.bookingId)}`
}

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100))
	const cursor = parseBookingCursor(url.searchParams.get("cursor"))
	const bookingPredicates = [eq(Booking.providerId, auth.providerId)]
	if (cursor) {
		bookingPredicates.push(
			or(
				lt(Booking.confirmedAt, cursor.confirmedAt),
				and(eq(Booking.confirmedAt, cursor.confirmedAt), lt(Booking.id, cursor.id))
			)!
		)
	}

	const bookingIdRows = await db
		.select({ bookingId: Booking.id, confirmedAt: Booking.confirmedAt })
		.from(Booking)
		.where(and(...bookingPredicates))
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
		.limit(limit + 1)
		.all()
	const pagedBookingIds = bookingIdRows.slice(0, limit).map((row) => String(row.bookingId))
	if (!pagedBookingIds.length) {
		return json({
			items: [],
			summary: {
				totalBookings: 0,
				totalGrossAmount: 0,
				totalNetPayable: 0,
				totalCommission: 0,
				blockedCount: 0,
				readyCount: 0,
			},
			pagination: { limit, returned: 0, hasMore: false, nextCursor: null },
			readOnly: true,
			sourceOfTruth: {
				contractGrossAmount: "BookingRoomDetail snapshot aggregation",
				commissionBasis: "CommissionSnapshot",
				settlementEvidence: "FinancialSettlementRecord",
				payableVisibility: "ProviderPayableSnapshot",
				payoutEligibility:
					"ProviderPayableSnapshot + ReconciliationMatch + ProviderFinancialProfile",
				providerStatementAggregation: "ProviderStatement",
				compatibilityOnlyExcluded: true,
			},
		})
	}

	const bookingRows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			confirmedAt: Booking.confirmedAt,
			detailId: BookingRoomDetail.id,
			detailTotalAmount: BookingRoomDetail.totalAmount,
			detailTaxAmount: BookingRoomDetail.taxAmount,
			providerIdSnapshot: BookingRoomDetail.providerIdSnapshot,
			productIdSnapshot: BookingRoomDetail.productIdSnapshot,
			productId: Product.id,
			productNameSnapshot: BookingRoomDetail.productNameSnapshot,
			variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
			productName: Product.name,
			variantName: Variant.name,
		})
		.from(Booking)
		.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
		.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
		.leftJoin(Product, eq(Product.id, Variant.productId))
		.where(and(eq(Booking.providerId, auth.providerId), inArray(Booking.id, pagedBookingIds)))
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
		.all()
	const bookingIds = [...new Set(bookingRows.map((row) => String(row.bookingId)).filter(Boolean))]

	const taxRows = bookingIds.length
		? await db
				.select({
					bookingId: BookingTaxFee.bookingId,
					totalAmount: BookingTaxFee.totalAmount,
				})
				.from(BookingTaxFee)
				.where(inArray(BookingTaxFee.bookingId, bookingIds))
				.all()
		: []

	const [
		profile,
		commissionSnapshots,
		payableSnapshots,
		payoutRecords,
		statements,
		reconciliationMatches,
		settlementRecords,
	] = await Promise.all([
		providerFinancialProfileRepository.findByProviderId(auth.providerId),
		commissionSnapshotRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		providerPayableSnapshotRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		payoutRecordRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		providerStatementRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		reconciliationMatchRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		financialSettlementRecordRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
	])

	const summary = buildProviderFinanceSummary({
		providerId: auth.providerId,
		bookingRows,
		taxRows,
		profile,
		commissionSnapshots,
		payableSnapshots,
		payoutRecords,
		statements,
		reconciliationMatches,
		settlementRecords,
	})

	return json({
		...summary,
		pagination: {
			limit,
			returned: Array.isArray(summary.items) ? summary.items.length : 0,
			hasMore: bookingIdRows.length > limit,
			nextCursor:
				bookingIdRows.length > limit ? bookingCursorFromRow(bookingIdRows[limit - 1]) : null,
		},
		readOnly: true,
		sourceOfTruth: {
			contractGrossAmount: "BookingRoomDetail snapshot aggregation",
			commissionBasis: "CommissionSnapshot",
			settlementEvidence: "FinancialSettlementRecord",
			payableVisibility: "ProviderPayableSnapshot",
			payoutEligibility: "ProviderPayableSnapshot + ReconciliationMatch + ProviderFinancialProfile",
			providerStatementAggregation: "ProviderStatement",
			compatibilityOnlyExcluded: true,
		},
	})
}
