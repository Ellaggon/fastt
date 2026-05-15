import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	desc,
	eq,
	FinancialShadowRecord,
	inArray,
	Product,
	sql,
	Variant,
} from "astro:db"

import {
	financialReferenceRepository,
	financialSettlementRecordRepository,
	paymentTransactionRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import {
	buildDuplicateExternalReferenceSignals,
	buildFinancialReconciliationMatch,
} from "@/modules/financial/application/use-cases/build-financial-reconciliation-match"

import { json, requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const status = String(url.searchParams.get("status") ?? "all").trim()
	const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 250))

	const rows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			totalAmountUSD: Booking.totalAmountUSD,
			totalAmountBOB: Booking.totalAmountBOB,
			confirmedAt: Booking.confirmedAt,
			checkInDate: Booking.checkInDate,
			checkOutDate: Booking.checkOutDate,
			refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
			contractSnapshotVersion: Booking.contractSnapshotVersion,
			detailId: BookingRoomDetail.id,
			detailTotalPrice: BookingRoomDetail.totalPrice,
			detailTaxes: BookingRoomDetail.taxes,
			providerIdSnapshot: BookingRoomDetail.providerIdSnapshot,
			productNameSnapshot: BookingRoomDetail.productNameSnapshot,
			variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
			ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
			productName: Product.name,
			variantName: Variant.name,
		})
		.from(Booking)
		.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
		.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
		.leftJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				sql`(${Product.providerId} = ${auth.providerId} OR ${BookingRoomDetail.providerIdSnapshot} = ${auth.providerId})`
			)
		)
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
		.all()
	const bookingIds = [...new Set(rows.map((row) => String(row.bookingId)).filter(Boolean))]
	if (!bookingIds.length) {
		return json({ items: [], duplicateExternalReferences: [], summary: emptySummary() })
	}

	const [
		shadowRows,
		taxRows,
		paymentTransactions,
		settlementRecords,
		references,
		persistedMatches,
		duplicateRaw,
	] = await Promise.all([
		db
			.select({
				bookingId: FinancialShadowRecord.bookingId,
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
				createdAt: FinancialShadowRecord.createdAt,
			})
			.from(FinancialShadowRecord)
			.where(inArray(FinancialShadowRecord.bookingId, bookingIds))
			.all(),
		db
			.select({
				bookingId: BookingTaxFee.bookingId,
				totalAmount: BookingTaxFee.totalAmount,
				breakdownJson: BookingTaxFee.breakdownJson,
			})
			.from(BookingTaxFee)
			.where(inArray(BookingTaxFee.bookingId, bookingIds))
			.all(),
		paymentTransactionRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		financialSettlementRecordRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		financialReferenceRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		reconciliationMatchRepository.findByProvider({ providerId: auth.providerId, limit: 1000 }),
		paymentTransactionRepository.findDuplicateExternalReferences(auth.providerId),
	])

	const grouped = groupBy(rows, (row) => String(row.bookingId))
	const shadowByBooking = groupBy(shadowRows, (row) => String(row.bookingId))
	const taxByBooking = groupBy(taxRows, (row) => String(row.bookingId))
	const paymentByBooking = groupBy(paymentTransactions, (row) => row.bookingId)
	const settlementByBooking = groupBy(settlementRecords, (row) => row.bookingId)
	const referencesByBooking = groupBy(references, (row) => row.bookingId)
	const persistedByBooking = new Map(persistedMatches.map((row) => [row.bookingId, row]))

	let items = [...grouped.values()].map((group) => {
		const bookingId = String(group[0]?.bookingId ?? "")
		const match = buildFinancialReconciliationMatch({
			group,
			shadowRows: shadowByBooking.get(bookingId) ?? [],
			taxRows: taxByBooking.get(bookingId) ?? [],
			providerId: auth.providerId,
			paymentTransactions: paymentByBooking.get(bookingId) ?? [],
			settlementRecords: settlementByBooking.get(bookingId) ?? [],
			references: referencesByBooking.get(bookingId) ?? [],
		})
		const persisted = persistedByBooking.get(bookingId)
		return persisted
			? {
					...match,
					reviewStatus: persisted.reviewStatus,
					reviewedAt: persisted.reviewedAt,
					reviewedBy: persisted.reviewedBy,
					reviewNote: persisted.reviewNote,
				}
			: match
	})
	if (status !== "all") items = items.filter((item) => item.status === status)
	items = items.slice(0, limit)
	const duplicateExternalReferences = buildDuplicateExternalReferenceSignals({
		providerId: auth.providerId,
		duplicates: duplicateRaw,
	})
	return json({
		items,
		duplicateExternalReferences,
		summary: {
			total: items.length,
			matched: items.filter((item) => item.status === "matched").length,
			mismatch: items.filter((item) => item.status === "mismatch").length,
			missingPayment: items.filter((item) => item.status === "missing_payment").length,
			missingSettlement: items.filter((item) => item.status === "missing_settlement").length,
			currencyMismatch: items.filter((item) => item.status === "currency_mismatch").length,
			duplicateExternalReferences: duplicateExternalReferences.length,
		},
		readOnly: true,
	})
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>()
	for (const row of rows) {
		const key = keyFn(row)
		const bucket = grouped.get(key) ?? []
		bucket.push(row)
		grouped.set(key, bucket)
	}
	return grouped
}

function emptySummary() {
	return {
		total: 0,
		matched: 0,
		mismatch: 0,
		missingPayment: 0,
		missingSettlement: 0,
		currencyMismatch: 0,
		duplicateExternalReferences: 0,
	}
}
