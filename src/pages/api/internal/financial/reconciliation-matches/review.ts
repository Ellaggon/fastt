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
	financialReferenceRepository,
	financialSettlementRecordRepository,
	paymentTransactionRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import { buildFinancialReconciliationMatch } from "@/modules/financial/application/use-cases/build-financial-reconciliation-match"

import { bookingBelongsToProvider, json, readJson, requireFinancialProvider } from "../_stage2"

export const POST: APIRoute = async ({ request }) => {
	try {
		const auth = await requireFinancialProvider(request)
		if (!auth.ok) return auth.response
		const body = await readJson(request)
		const bookingId = String(body.bookingId ?? "").trim()
		const reviewNote = String(body.reviewNote ?? "").trim() || null
		if (!bookingId)
			return json({ error: "validation_error", details: "bookingId is required" }, 400)
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

		const [shadowRows, taxRows, paymentTransactions, settlementRecords, references] =
			await Promise.all([
				db
					.select({
						bookingId: FinancialShadowRecord.bookingId,
						type: FinancialShadowRecord.type,
						payload: FinancialShadowRecord.payload,
						createdAt: FinancialShadowRecord.createdAt,
					})
					.from(FinancialShadowRecord)
					.where(eq(FinancialShadowRecord.bookingId, bookingId))
					.all(),
				db
					.select({
						bookingId: BookingTaxFee.bookingId,
						totalAmount: BookingTaxFee.totalAmount,
						breakdownJson: BookingTaxFee.breakdownJson,
					})
					.from(BookingTaxFee)
					.where(eq(BookingTaxFee.bookingId, bookingId))
					.all(),
				paymentTransactionRepository.findByBookingId(bookingId),
				financialSettlementRecordRepository.findByBookingId(bookingId),
				financialReferenceRepository.findByBookingId(bookingId),
			])
		const match = buildFinancialReconciliationMatch({
			group: rows,
			shadowRows,
			taxRows,
			providerId: auth.providerId,
			paymentTransactions: paymentTransactions.filter((row) => row.providerId === auth.providerId),
			settlementRecords: settlementRecords.filter((row) => row.providerId === auth.providerId),
			references: references.filter((row) => row.providerId === auth.providerId),
		})
		const reviewed = await reconciliationMatchRepository.createOrUpdate({
			id: match.id,
			bookingId: match.bookingId,
			providerId: auth.providerId,
			contractAmount: match.contractAmount,
			paymentAmount: match.paymentAmount,
			settlementAmount: match.settlementAmount,
			differenceAmount: match.differenceAmount,
			status: match.status,
			basis: match.basis,
			reviewStatus: "reviewed",
			reviewedAt: new Date(),
			reviewedBy: auth.user.email,
			reviewNote,
		})
		return json({ item: reviewed, reviewOnly: true })
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
