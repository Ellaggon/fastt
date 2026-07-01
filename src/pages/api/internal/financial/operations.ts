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
	Product,
	Provider,
	Variant,
} from "astro:db"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { buildFinancialOperationReview } from "@/modules/financial/public"
type FinancialExceptionCode =
	| "refund_handoff_required"
	| "evidence_unknown"
	| "missing_payment_reference"
	| "missing_settlement_reference"
	| "missing_refund_reference"
	| "incomplete_contract_snapshot"
	| "multi_room_review"

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const stateFilter = String(url.searchParams.get("state") ?? "all")
			.trim()
			.toLowerCase()
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
				productIdSnapshot: BookingRoomDetail.productIdSnapshot,
				productNameSnapshot: BookingRoomDetail.productNameSnapshot,
				variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
				ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
				productId: Product.id,
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
			.where(and(eq(Booking.providerId, providerId)))
			.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
			.all()

		const bookingIds = [...new Set(rows.map((row) => String(row.bookingId)).filter(Boolean))]
		const financialEvidenceRows: Array<{
			bookingId: string
			type: string
			payload: unknown
			createdAt: unknown
		}> = []
		let taxRows: Array<{
			bookingId: string
			totalAmount: unknown
			breakdownJson: unknown
		}> = []
		if (bookingIds.length) {
			try {
				taxRows = await db
					.select({
						bookingId: BookingTaxFee.bookingId,
						totalAmount: BookingTaxFee.totalAmount,
						breakdownJson: BookingTaxFee.breakdownJson,
					})
					.from(BookingTaxFee)
					.where(inArray(BookingTaxFee.bookingId, bookingIds))
					.all()
			} catch (error) {
				console.warn("booking_tax_fee_lookup_degraded", {
					providerId,
					error: error instanceof Error ? error.message : "unknown",
				})
			}
		}

		const financialEvidenceByBooking = new Map<string, typeof financialEvidenceRows>()
		for (const row of financialEvidenceRows) {
			const bucket = financialEvidenceByBooking.get(row.bookingId) ?? []
			bucket.push(row)
			financialEvidenceByBooking.set(row.bookingId, bucket)
		}
		const taxByBooking = new Map<string, typeof taxRows>()
		for (const row of taxRows) {
			const bucket = taxByBooking.get(row.bookingId) ?? []
			bucket.push(row)
			taxByBooking.set(row.bookingId, bucket)
		}

		const grouped = new Map<string, typeof rows>()
		for (const row of rows) {
			const bucket = grouped.get(row.bookingId) ?? []
			bucket.push(row)
			grouped.set(row.bookingId, bucket)
		}

		let items = Array.from(grouped.values()).map((group) => {
			const first = group[0]
			return buildFinancialOperationReview({
				group,
				financialEvidenceRows: financialEvidenceByBooking.get(first.bookingId) ?? [],
				taxRows: taxByBooking.get(first.bookingId) ?? [],
				providerId,
			})
		})

		items.sort((left, right) => {
			const leftOpen = left.operationalException.hasOpenException ? 1 : 0
			const rightOpen = right.operationalException.hasOpenException ? 1 : 0
			if (leftOpen !== rightOpen) return rightOpen - leftOpen
			return (right.operationalException.ageDays ?? 0) - (left.operationalException.ageDays ?? 0)
		})

		if (stateFilter !== "all") {
			items = items.filter((item) => item.evidenceAlignment.state === stateFilter)
		}

		const exceptionCodes = (code: FinancialExceptionCode) =>
			items.filter((item) => item.operationalException.all.some((entry) => entry.code === code))
				.length
		const missingReferenceCount = items.filter((item) =>
			item.operationalException.all.some((entry) =>
				[
					"missing_payment_reference",
					"missing_settlement_reference",
					"missing_refund_reference",
				].includes(entry.code)
			)
		).length
		const snapshotGapCount = items.filter((item) =>
			item.operationalException.all.some((entry) =>
				["incomplete_contract_snapshot"].includes(entry.code)
			)
		).length

		const summary = {
			totalBookings: items.length,
			openExceptions: items.filter((item) => item.operationalException.hasOpenException).length,
			contractValue: Number(items.reduce((sum, item) => sum + item.contractTotal, 0).toFixed(2)),
			taxesVisible: Number(items.reduce((sum, item) => sum + item.taxesTotal, 0).toFixed(2)),
			refundHandoffPending: items.filter(
				(item) => item.evidenceAlignment.state === "handoff_pending"
			).length,
			evidencePartial: items.filter((item) => item.evidenceAlignment.state === "evidence_partial")
				.length,
			evidenceMatched: items.filter((item) => item.evidenceAlignment.state === "evidence_matched")
				.length,
			snapshotReady: items.filter((item) => item.evidenceAlignment.state === "snapshot_ready")
				.length,
			evidenceUnknown: items.filter((item) => item.evidenceAlignment.state === "evidence_unknown")
				.length,
			missingReferenceCount,
			snapshotGapCount,
			multiRoomReview: exceptionCodes("multi_room_review"),
		}

		return new Response(
			JSON.stringify({
				summary,
				items,
				boundaries: {
					pricing: "snapshot_only_no_live_pricing",
					inventory: "no_inventory_mutation",
					payments: "visibility_not_psp_orchestration",
					accounting: "not_a_ledger",
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error) {
		return new Response(
			JSON.stringify({
				summary: {
					totalBookings: 0,
					openExceptions: 0,
					contractValue: 0,
					taxesVisible: 0,
					commissionVisible: 0,
					refundHandoffPending: 0,
					evidencePartial: 0,
					evidenceMatched: 0,
					snapshotReady: 0,
					evidenceUnknown: 0,
					missingReferenceCount: 0,
					snapshotGapCount: 0,
					multiRoomReview: 0,
				},
				items: [],
				boundaries: {
					pricing: "snapshot_only_no_live_pricing",
					inventory: "no_inventory_mutation",
					payments: "visibility_not_psp_orchestration",
					accounting: "not_a_ledger",
				},
				degraded: true,
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	}
}
