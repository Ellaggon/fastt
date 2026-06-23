import type { APIRoute } from "astro"
import {
	and,
	Booking,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	desc,
	eq,
	Product,
	Variant,
} from "astro:db"

import {
	buildFinancialOperationReview,
	buildFinancialReconciliationMatch,
} from "@/modules/financial/public"
import {
	financialReferenceRepository,
	financialSettlementRecordRepository,
	paymentTransactionRepository,
} from "@/container/financial.container"

import { bookingBelongsToProvider, json, requireFinancialProvider } from "./_stage2"

type EvidenceComparisonStatus = "ok" | "mismatch" | "missing"

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const auth = await requireFinancialProvider(request)
		if (!auth.ok) return auth.response
		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			return json({ error: "validation_error", details: "bookingId is required" }, 400)
		}
		if (!(await bookingBelongsToProvider(bookingId, auth.providerId)))
			return json({ error: "not_found" }, 404)

		const rows = await db
			.select({
				bookingId: Booking.id,
				status: Booking.status,
				currency: Booking.currency,
				totalAmount: Booking.totalAmount,
				confirmedAt: Booking.confirmedAt,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
				contractSnapshotVersion: Booking.contractSnapshotVersion,
				detailId: BookingRoomDetail.id,
				detailTotalAmount: BookingRoomDetail.totalAmount,
				detailTaxAmount: BookingRoomDetail.taxAmount,
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
			.where(and(eq(Booking.id, bookingId), eq(Booking.providerId, auth.providerId)))
			.orderBy(desc(BookingRoomDetail.id))
			.all()
		if (!rows.length) return json({ error: "not_found" }, 404)

		const financialEvidenceRows: Array<{
			bookingId: string
			type: string
			payload: unknown
			createdAt: unknown
		}> = []
		const taxRows = await db
			.select({
				bookingId: BookingTaxFee.bookingId,
				totalAmount: BookingTaxFee.totalAmount,
				breakdownJson: BookingTaxFee.breakdownJson,
			})
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()
		const review = buildFinancialOperationReview({
			group: rows,
			financialEvidenceRows,
			taxRows,
			providerId: auth.providerId,
		})
		let paymentTransactions: Awaited<
			ReturnType<typeof paymentTransactionRepository.findByBookingId>
		> = []
		let settlementRecords: Awaited<
			ReturnType<typeof financialSettlementRecordRepository.findByBookingId>
		> = []
		let references: Awaited<ReturnType<typeof financialReferenceRepository.findByBookingId>> = []
		let stage3Degraded = false
		try {
			;[paymentTransactions, settlementRecords, references] = await Promise.all([
				paymentTransactionRepository.findByBookingId(bookingId),
				financialSettlementRecordRepository.findByBookingId(bookingId),
				financialReferenceRepository.findByBookingId(bookingId),
			])
		} catch (error) {
			stage3Degraded = true
			console.warn("financial_stage3_reconciliation_lookup_degraded", {
				providerId: auth.providerId,
				bookingId,
				error: error instanceof Error ? error.message : "unknown",
			})
		}
		const match = buildFinancialReconciliationMatch({
			group: rows,
			financialEvidenceRows,
			taxRows,
			providerId: auth.providerId,
			paymentTransactions: paymentTransactions.filter((row) => row.providerId === auth.providerId),
			settlementRecords: settlementRecords.filter((row) => row.providerId === auth.providerId),
			references: references.filter((row) => row.providerId === auth.providerId),
		})

		const paymentEvidenceRows = financialEvidenceRows.filter((row) => row.type === "payment_intent")
		const paymentEvidenceAligned = paymentEvidenceRows.length > 0
		let status: EvidenceComparisonStatus = "ok"
		if (paymentEvidenceRows.length === 0) status = "missing"
		else if (!paymentEvidenceAligned) status = "mismatch"

		return json({
			booking: {
				bookingId,
				finalTotal: review.contractTotal,
				currency: review.currency,
				multiRoomAllocationCount: review.snapshotIntegrity.multiRoomAllocationCount,
			},
			match,
			queues: match.queues,
			stage3: {
				degraded: stage3Degraded,
				source: "payment_transaction_and_settlement_evidence",
				readOnly: true,
			},
			financial: {
				paymentIntents: paymentEvidenceRows.map((row) => row.payload),
				settlementRecords: financialEvidenceRows
					.filter((row) => row.type === "settlement_record")
					.map((row) => row.payload),
				paymentTransactions,
				financialSettlementRecords: settlementRecords,
				references,
			},
			evidenceAlignment: review.evidenceAlignment,
			reconciliation: {
				status,
				basis: "legacy_snapshot_and_shadow_evidence_comparison",
				deprecated: true,
				compatibilityOnly: true,
				replacement: "match.status",
				readOnly: true,
			},
			legacyReconciliationCompatibility: {
				status,
				basis: "legacy_snapshot_and_shadow_evidence_comparison",
				readOnly: true,
			},
		})
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
