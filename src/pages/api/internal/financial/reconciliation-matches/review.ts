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
	Provider,
	Variant,
} from "@/shared/infrastructure/db/compat"

import {
	financialReviewEventRepository,
	financialReferenceRepository,
	financialSettlementRecordRepository,
	paymentTransactionRepository,
	reconciliationMatchRepository,
} from "@/container/financial.container"
import { buildFinancialReconciliationMatch } from "@/modules/financial/public"

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
				totalAmount: Booking.totalAmount,
				confirmedAt: Booking.confirmedAt,
				guestNameSnapshot: Booking.guestNameSnapshot,
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
				providerDisplayName: Provider.displayName,
				providerLegalName: Provider.legalName,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(Booking)
			.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
			.leftJoin(Provider, eq(Provider.id, Booking.providerId))
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Booking.id, bookingId), eq(Booking.providerId, auth.providerId)))
			.orderBy(desc(BookingRoomDetail.id))

		if (!rows.length) return json({ error: "not_found" }, 404)

		const [taxRows, paymentTransactions, settlementRecords, references] = await Promise.all([
			db
				.select({
					bookingId: BookingTaxFee.bookingId,
					totalAmount: BookingTaxFee.totalAmount,
					breakdownJson: BookingTaxFee.breakdownJson,
				})
				.from(BookingTaxFee)
				.where(eq(BookingTaxFee.bookingId, bookingId)),
			paymentTransactionRepository.findByBookingId(bookingId),
			financialSettlementRecordRepository.findByBookingId(bookingId),
			financialReferenceRepository.findByBookingId(bookingId),
		])
		const financialEvidenceRows: Array<{
			bookingId: string
			type: string
			payload: unknown
			createdAt: unknown
		}> = []
		const match = buildFinancialReconciliationMatch({
			group: rows,
			financialEvidenceRows,
			taxRows,
			providerId: auth.providerId,
			paymentTransactions: paymentTransactions.filter((row) => row.providerId === auth.providerId),
			settlementRecords: settlementRecords.filter((row) => row.providerId === auth.providerId),
			references: references.filter((row) => row.providerId === auth.providerId),
		})
		const previous = await reconciliationMatchRepository.findByBookingIdForProvider(
			match.bookingId,
			auth.providerId
		)
		const previousState =
			previous?.reviewStatus === "reviewed"
				? previous.reviewFingerprint === match.comparisonFingerprint
					? "fresh"
					: "stale"
				: (previous?.reviewState ?? "fresh")
		if (
			previous?.reviewStatus === "reviewed" &&
			previous.reviewFingerprint !== match.comparisonFingerprint
		) {
			await financialReviewEventRepository.append({
				bookingId: match.bookingId,
				providerId: auth.providerId,
				reconciliationMatchId: previous.id,
				type: "reconciliation_review_marked_stale",
				actorId: auth.user.email,
				actorType: "operator",
				payloadJson: {
					previousState,
					newState: "stale",
					previousFingerprint: previous.reviewFingerprint,
					currentFingerprint: match.comparisonFingerprint,
					evidenceBasis: {
						status: match.status,
						mismatchReasons: match.mismatchReasons,
						paymentAmount: match.paymentAmount,
						settlementAmount: match.settlementAmount,
						contractAmount: match.contractAmount,
					},
				},
			})
		}
		const reviewed = await reconciliationMatchRepository.createOrUpdate({
			id: match.id,
			bookingId: match.bookingId,
			providerId: auth.providerId,
			contractAmount: match.contractAmount,
			paymentAmount: match.paymentAmount,
			settlementAmount: match.settlementAmount,
			differenceAmount: match.differenceAmount,
			status: match.status,
			mismatchReasons: match.mismatchReasons,
			basis: match.basis,
			reviewStatus: "reviewed",
			reviewState: "fresh",
			comparisonFingerprint: match.comparisonFingerprint,
			reviewFingerprint: match.comparisonFingerprint,
			reviewedAt: new Date(),
			reviewedBy: auth.user.email,
			reviewNote,
		})
		await financialReviewEventRepository.append({
			bookingId: match.bookingId,
			providerId: auth.providerId,
			reconciliationMatchId: reviewed.id,
			type: "reconciliation_match_reviewed",
			actorId: auth.user.email,
			actorType: "operator",
			payloadJson: {
				previousState,
				newState: "fresh",
				previousReviewStatus: previous?.reviewStatus ?? "unreviewed",
				newReviewStatus: "reviewed",
				evidenceBasis: {
					status: match.status,
					mismatchReasons: match.mismatchReasons,
					comparisonFingerprint: match.comparisonFingerprint,
					contractAmount: match.contractAmount,
					paymentAmount: match.paymentAmount,
					settlementAmount: match.settlementAmount,
					differenceAmount: match.differenceAmount,
				},
			},
		})
		return json({ item: reviewed, reviewOnly: true })
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
