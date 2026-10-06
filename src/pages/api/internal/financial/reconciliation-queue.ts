import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingLineItem,
	BookingTaxFee,
	db,
	desc,
	eq,
	inArray,
	Provider,
	Variant,
} from "@/shared/infrastructure/db/compat"

import {
	financialReferenceRepository,
	financialSettlementRecordRepository,
	paymentTransactionRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import {
	buildDuplicateExternalReferenceSignals,
	buildFinancialReconciliationMatch,
} from "@/modules/financial/public"

import {
	resolveFinancialApiProductScope,
	type FinancialApiProductFilter,
} from "@/lib/financial/financialApiProductScope"
import {
	listScopedProviderBookingIdPage,
	parseFinancialBookingCursor,
} from "@/lib/financial/financialScopedBookingQuery"
import { snapshotProduct, variantProduct } from "@/lib/financial/providerFinanceLineAggregate"

import { json, requireFinancialProvider } from "./_stage2"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const scopeResult = await resolveFinancialApiProductScope(auth.providerId, url)
	if (!scopeResult.ok) return scopeResult.response

	const status = String(url.searchParams.get("status") ?? "all").trim()
	const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 250))
	const cursor = parseFinancialBookingCursor(url.searchParams.get("cursor"))
	const bookingPage = await listScopedProviderBookingIdPage({
		providerId: auth.providerId,
		productFilter: scopeResult.productFilter,
		cursor,
		limit,
	})
	const pagedBookingIds = bookingPage.rows.map((row) => row.bookingId)
	if (!pagedBookingIds.length) {
		const [unmatchedPaymentTransactions, unmatchedSettlementRecords, duplicateRaw] =
			await Promise.all([
				paymentTransactionRepository.findUnmatchedByProvider({
					providerId: auth.providerId,
					limit: 250,
				}),
				financialSettlementRecordRepository.findUnmatchedByProvider({
					providerId: auth.providerId,
					limit: 250,
				}),
				paymentTransactionRepository.findDuplicateExternalReferences(auth.providerId),
			])
		const duplicateExternalReferences = buildDuplicateExternalReferenceSignals({
			providerId: auth.providerId,
			duplicates: duplicateRaw,
		})
		return json({
			items: [],
			duplicateExternalReferences,
			unmatchedEvidence: {
				...unmatchedEvidenceScope(scopeResult.productFilter),
				paymentTransactions: unmatchedPaymentTransactions.map((row) => ({
					...row,
					mismatchReason: "unmatched_payment_transaction",
				})),
				settlementRecords: unmatchedSettlementRecords.map((row) => ({
					...row,
					mismatchReason: "unmatched_settlement_record",
				})),
			},
			summary: emptySummary({
				duplicateExternalReferences: duplicateExternalReferences.length,
				unmatchedPaymentTransactions: unmatchedPaymentTransactions.length,
				unmatchedSettlementRecords: unmatchedSettlementRecords.length,
			}),
			pagination: { limit, returned: 0, hasMore: false, nextCursor: null },
			readOnly: true,
		})
	}

	const rows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			totalAmount: Booking.totalAmount,
			confirmedAt: Booking.confirmedAt,
			guestNameSnapshot: Booking.guestNameSnapshot,
			checkInDate: Booking.checkInDate,
			checkOutDate: Booking.checkOutDate,
			refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
			contractSnapshotVersion: Booking.contractSnapshotVersion,
			detailId: BookingLineItem.id,
			detailTotalAmount: BookingLineItem.totalAmount,
			detailTaxAmount: BookingLineItem.taxAmount,
			providerIdSnapshot: BookingLineItem.providerIdSnapshot,
			productNameSnapshot: BookingLineItem.productNameSnapshot,
			variantNameSnapshot: BookingLineItem.variantNameSnapshot,
			ratePlanNameSnapshot: BookingLineItem.ratePlanNameSnapshot,
			providerDisplayName: Provider.displayName,
			providerLegalName: Provider.legalName,
			productName: snapshotProduct.name,
			productType: snapshotProduct.productType,
			productTypeFallback: variantProduct.productType,
			variantName: Variant.name,
		})
		.from(Booking)
		.leftJoin(BookingLineItem, eq(BookingLineItem.bookingId, Booking.id))
		.leftJoin(Provider, eq(Provider.id, Booking.providerId))
		.leftJoin(snapshotProduct, eq(snapshotProduct.id, BookingLineItem.productIdSnapshot))
		.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
		.leftJoin(variantProduct, eq(variantProduct.id, Variant.productId))
		.where(and(eq(Booking.providerId, auth.providerId), inArray(Booking.id, pagedBookingIds)))
		.orderBy(desc(Booking.confirmedAt), desc(Booking.id))

	const bookingIds = [...new Set(rows.map((row) => String(row.bookingId)).filter(Boolean))]

	const [
		taxRows,
		paymentTransactions,
		settlementRecords,
		references,
		persistedMatches,
		unmatchedPaymentTransactions,
		unmatchedSettlementRecords,
		duplicateRaw,
	] = await Promise.all([
		db
			.select({
				bookingId: BookingTaxFee.bookingId,
				totalAmount: BookingTaxFee.totalAmount,
				breakdownJson: BookingTaxFee.breakdownJson,
			})
			.from(BookingTaxFee)
			.where(inArray(BookingTaxFee.bookingId, bookingIds)),
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
		reconciliationMatchRepository.findByProvider({
			providerId: auth.providerId,
			bookingIds,
			limit: 1000,
		}),
		paymentTransactionRepository.findUnmatchedByProvider({
			providerId: auth.providerId,
			limit: 250,
		}),
		financialSettlementRecordRepository.findUnmatchedByProvider({
			providerId: auth.providerId,
			limit: 250,
		}),
		paymentTransactionRepository.findDuplicateExternalReferences(auth.providerId),
	])

	const financialEvidenceRows: Array<{
		bookingId: string
		type: string
		payload: unknown
		createdAt: unknown
	}> = []
	const grouped = groupBy(rows, (row) => String(row.bookingId))
	const financialEvidenceByBooking = groupBy(financialEvidenceRows, (row) => String(row.bookingId))
	const taxByBooking = groupBy(taxRows, (row) => String(row.bookingId))
	const paymentByBooking = groupBy(
		paymentTransactions.filter((row): row is typeof row & { bookingId: string } =>
			Boolean(row.bookingId)
		),
		(row) => row.bookingId
	)
	const settlementByBooking = groupBy(
		settlementRecords.filter((row): row is typeof row & { bookingId: string } =>
			Boolean(row.bookingId)
		),
		(row) => row.bookingId
	)
	const referencesByBooking = groupBy(references, (row) => row.bookingId)
	const persistedByBooking = new Map(persistedMatches.map((row) => [row.bookingId, row]))

	const duplicateExternalReferences = buildDuplicateExternalReferenceSignals({
		providerId: auth.providerId,
		duplicates: duplicateRaw,
	})
	let items = [...grouped.values()].map((group) => {
		const bookingId = String(group[0]?.bookingId ?? "")
		const match = buildFinancialReconciliationMatch({
			group,
			financialEvidenceRows: financialEvidenceByBooking.get(bookingId) ?? [],
			taxRows: taxByBooking.get(bookingId) ?? [],
			providerId: auth.providerId,
			paymentTransactions: paymentByBooking.get(bookingId) ?? [],
			settlementRecords: settlementByBooking.get(bookingId) ?? [],
			references: referencesByBooking.get(bookingId) ?? [],
		})
		const persisted = persistedByBooking.get(bookingId)
		const hasDuplicateReference = duplicateExternalReferences.some((signal) =>
			(signal.bookingIds || []).includes(bookingId)
		)
		const mismatchReasons = [
			...(match.mismatchReasons || []),
			...(hasDuplicateReference ? ["duplicate_external_reference" as const] : []),
		]
		const reviewState =
			persisted?.reviewStatus === "reviewed"
				? persisted.reviewFingerprint === match.comparisonFingerprint
					? "fresh"
					: "stale"
				: (persisted?.reviewState ?? null)
		return {
			...match,
			mismatchReasons:
				reviewState === "stale"
					? [...new Set([...mismatchReasons, "stale_review"])]
					: mismatchReasons,
			reviewStatus: persisted?.reviewStatus ?? match.reviewStatus,
			reviewState,
			reviewedAt: persisted?.reviewedAt ?? match.reviewedAt,
			reviewedBy: persisted?.reviewedBy ?? match.reviewedBy,
			reviewNote: persisted?.reviewNote ?? match.reviewNote,
			reviewFingerprint: persisted?.reviewFingerprint ?? null,
		}
	})
	if (status !== "all") items = items.filter((item) => item.status === status)
	items = items.slice(0, limit)
	return json({
		items,
		duplicateExternalReferences,
		unmatchedEvidence: {
			...unmatchedEvidenceScope(scopeResult.productFilter),
			paymentTransactions: unmatchedPaymentTransactions.map((row) => ({
				...row,
				mismatchReason: "unmatched_payment_transaction",
			})),
			settlementRecords: unmatchedSettlementRecords.map((row) => ({
				...row,
				mismatchReason: "unmatched_settlement_record",
			})),
		},
		summary: {
			total: items.length,
			matched: items.filter((item) => item.status === "matched").length,
			mismatch: items.filter((item) => item.status === "mismatch").length,
			missingPayment: items.filter((item) => item.status === "missing_payment").length,
			missingSettlement: items.filter((item) => item.status === "missing_settlement").length,
			currencyMismatch: items.filter((item) => item.status === "currency_mismatch").length,
			duplicateExternalReferences: duplicateExternalReferences.length,
			unmatchedPaymentTransactions: unmatchedPaymentTransactions.length,
			unmatchedSettlementRecords: unmatchedSettlementRecords.length,
		},
		pagination: {
			limit,
			returned: items.length,
			hasMore: bookingPage.hasMore,
			nextCursor: bookingPage.nextCursor,
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

/**
 * Evidence without a booking has no commercial line, so it cannot be attributed to the active
 * scope. It is still returned (it needs review) but declared as provider-wide so the client
 * presents it apart from scoped cases instead of mixing it in.
 */
function unmatchedEvidenceScope(productFilter: FinancialApiProductFilter) {
	return {
		scopeApplied: false as const,
		scope: productFilter === null ? ("provider" as const) : ("provider_unattributed" as const),
	}
}

type EmptySummaryOverrides = Partial<{
	total: number
	matched: number
	mismatch: number
	missingPayment: number
	missingSettlement: number
	currencyMismatch: number
	duplicateExternalReferences: number
	unmatchedPaymentTransactions: number
	unmatchedSettlementRecords: number
}>

function emptySummary(overrides: EmptySummaryOverrides = {}) {
	return {
		total: 0,
		matched: 0,
		mismatch: 0,
		missingPayment: 0,
		missingSettlement: 0,
		currencyMismatch: 0,
		duplicateExternalReferences: 0,
		unmatchedPaymentTransactions: 0,
		unmatchedSettlementRecords: 0,
		...overrides,
	}
}
