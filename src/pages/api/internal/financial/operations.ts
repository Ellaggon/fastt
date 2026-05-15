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

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { buildFinancialOperationReview } from "@/modules/financial/application/use-cases/build-financial-operation-review"
type FinancialExceptionCode =
	| "refund_handoff_required"
	| "reconciliation_unknown"
	| "missing_payment_reference"
	| "missing_settlement_reference"
	| "missing_refund_reference"
	| "incomplete_contract_snapshot"
	| "legacy_snapshot_compatibility"
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
				productIdSnapshot: BookingRoomDetail.productIdSnapshot,
				productNameSnapshot: BookingRoomDetail.productNameSnapshot,
				variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
				ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
				productId: Product.id,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(Booking)
			.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(
				and(
					sql`(${Product.providerId} = ${providerId} OR ${BookingRoomDetail.providerIdSnapshot} = ${providerId})`
				)
			)
			.orderBy(desc(Booking.confirmedAt), desc(Booking.id))
			.all()

		const bookingIds = [...new Set(rows.map((row) => String(row.bookingId)).filter(Boolean))]
		const shadowRows = bookingIds.length
			? await db
					.select({
						bookingId: FinancialShadowRecord.bookingId,
						type: FinancialShadowRecord.type,
						payload: FinancialShadowRecord.payload,
						createdAt: FinancialShadowRecord.createdAt,
					})
					.from(FinancialShadowRecord)
					.where(inArray(FinancialShadowRecord.bookingId, bookingIds))
					.all()
			: []
		const taxRows = bookingIds.length
			? await db
					.select({
						bookingId: BookingTaxFee.bookingId,
						totalAmount: BookingTaxFee.totalAmount,
						breakdownJson: BookingTaxFee.breakdownJson,
					})
					.from(BookingTaxFee)
					.where(inArray(BookingTaxFee.bookingId, bookingIds))
					.all()
			: []

		const shadowByBooking = new Map<string, typeof shadowRows>()
		for (const row of shadowRows) {
			const bucket = shadowByBooking.get(row.bookingId) ?? []
			bucket.push(row)
			shadowByBooking.set(row.bookingId, bucket)
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
				shadowRows: shadowByBooking.get(first.bookingId) ?? [],
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
			items = items.filter((item) => item.reconciliation.state === stateFilter)
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
				["incomplete_contract_snapshot", "legacy_snapshot_compatibility"].includes(entry.code)
			)
		).length

		const summary = {
			totalBookings: items.length,
			openExceptions: items.filter((item) => item.operationalException.hasOpenException).length,
			contractValue: Number(items.reduce((sum, item) => sum + item.contractTotal, 0).toFixed(2)),
			taxesVisible: Number(items.reduce((sum, item) => sum + item.taxesTotal, 0).toFixed(2)),
			commissionVisible: Number(
				items.reduce((sum, item) => sum + item.commissionTotal, 0).toFixed(2)
			),
			refundHandoffPending: items.filter((item) => item.reconciliation.state === "handoff_pending")
				.length,
			partiallyReconciled: items.filter(
				(item) => item.reconciliation.state === "partially_reconciled"
			).length,
			reconciled: items.filter((item) => item.reconciliation.state === "reconciled").length,
			snapshotReady: items.filter((item) => item.reconciliation.state === "snapshot_ready").length,
			reconciliationUnknown: items.filter(
				(item) => item.reconciliation.state === "reconciliation_unknown"
			).length,
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
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
