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
	Product,
	sql,
	Variant,
} from "astro:db"

import {
	buildFinancialOperationReview,
	readFinancialShadowAmount,
} from "@/modules/financial/application/use-cases/build-financial-operation-review"
import { buildFinancialReconciliationMatch } from "@/modules/financial/application/use-cases/build-financial-reconciliation-match"
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
					eq(Booking.id, bookingId),
					sql`(${Product.providerId} = ${auth.providerId} OR ${BookingRoomDetail.providerIdSnapshot} = ${auth.providerId})`
				)
			)
			.orderBy(desc(BookingRoomDetail.id))
			.all()
		if (!rows.length) return json({ error: "not_found" }, 404)

		const shadowRows = await db
			.select({
				bookingId: FinancialShadowRecord.bookingId,
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
				createdAt: FinancialShadowRecord.createdAt,
			})
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.bookingId, bookingId))
			.all()
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
			shadowRows,
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
			shadowRows,
			taxRows,
			providerId: auth.providerId,
			paymentTransactions: paymentTransactions.filter((row) => row.providerId === auth.providerId),
			settlementRecords: settlementRecords.filter((row) => row.providerId === auth.providerId),
			references: references.filter((row) => row.providerId === auth.providerId),
		})

		const paymentEvidenceRows = shadowRows.filter((row) => row.type === "payment_intent")
		const paymentEvidenceAligned = paymentEvidenceRows.some(
			(row) => readFinancialShadowAmount(row.payload) === review.contractTotal
		)
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
				settlementRecords: shadowRows
					.filter((row) => row.type === "settlement_record")
					.map((row) => row.payload),
				paymentTransactions,
				financialSettlementRecords: settlementRecords,
				references,
			},
			evidenceAlignment: review.evidenceAlignment,
			reconciliation: {
				status,
				basis: "snapshot_and_shadow_evidence_comparison",
				readOnly: true,
			},
		})
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
