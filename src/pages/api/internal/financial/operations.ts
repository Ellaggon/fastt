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

type ReconciliationState =
	| "snapshot_ready"
	| "handoff_pending"
	| "partially_reconciled"
	| "reconciled"
	| "reconciliation_unknown"

function dateOnly(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	const raw = String(value).trim()
	if (!raw) return null
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) return null
	return parsed.toISOString().slice(0, 10)
}

function readAmount(payload: unknown): number | null {
	if (!payload || typeof payload !== "object") return null
	const value = Number((payload as any).amount ?? (payload as any).grossAmount ?? NaN)
	return Number.isFinite(value) ? value : null
}

function readStatus(payload: unknown): string {
	if (!payload || typeof payload !== "object") return "unknown"
	return (
		String((payload as any).status ?? "unknown")
			.trim()
			.toLowerCase() || "unknown"
	)
}

function readCommission(payload: unknown): number {
	if (!payload || typeof payload !== "object") return 0
	const value = Number((payload as any).commissionAmount ?? 0)
	return Number.isFinite(value) ? value : 0
}

function hasRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.some((row) => readStatus(row.payload) === "recorded")
}

function allRecorded(rows: Array<{ payload: unknown }>): boolean {
	return rows.length > 0 && rows.every((row) => readStatus(row.payload) === "recorded")
}

function deriveReconciliationState(params: {
	status: string
	contractTotal: number
	paymentIntents: Array<{ payload: unknown }>
	settlementRecords: Array<{ payload: unknown }>
	refundRecords: Array<{ payload: unknown }>
}): ReconciliationState {
	const isCancelled = params.status.toLowerCase() === "cancelled"
	if (isCancelled && params.refundRecords.length === 0) return "handoff_pending"

	const hasFinancialShadow = params.paymentIntents.length > 0 || params.settlementRecords.length > 0
	if (!hasFinancialShadow) return "snapshot_ready"

	const paymentMatches = params.paymentIntents.some(
		(row) => readAmount(row.payload) === params.contractTotal
	)
	const settlementMatches = params.settlementRecords.some(
		(row) => readAmount(row.payload) === params.contractTotal
	)
	if (
		paymentMatches &&
		settlementMatches &&
		allRecorded(params.paymentIntents) &&
		allRecorded(params.settlementRecords)
	) {
		return "reconciled"
	}
	if (
		paymentMatches ||
		settlementMatches ||
		hasRecorded(params.paymentIntents) ||
		hasRecorded(params.settlementRecords)
	) {
		return "partially_reconciled"
	}
	return "reconciliation_unknown"
}

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
			const currency =
				String(first.currency ?? "USD")
					.trim()
					.toUpperCase() || "USD"
			const fallbackTotal =
				currency === "BOB" ? Number(first.totalAmountBOB ?? 0) : Number(first.totalAmountUSD ?? 0)
			const detailTotal = group.reduce((sum, row) => sum + Number(row.detailTotalPrice ?? 0), 0)
			const contractTotal = detailTotal > 0 ? detailTotal : fallbackTotal
			const taxesTotal = group.reduce((sum, row) => sum + Number(row.detailTaxes ?? 0), 0)
			const shadows = shadowByBooking.get(first.bookingId) ?? []
			const paymentIntents = shadows.filter((row) => row.type === "payment_intent")
			const settlementRecords = shadows.filter((row) => row.type === "settlement_record")
			const refundRecords = shadows.filter((row) => row.type === "refund_record")
			const commissionTotal = settlementRecords.reduce(
				(sum, row) => sum + readCommission(row.payload),
				0
			)
			const reconciliationState = deriveReconciliationState({
				status: String(first.status ?? "draft"),
				contractTotal,
				paymentIntents,
				settlementRecords,
				refundRecords,
			})
			const refundSnapshot =
				first.refundHandoffSnapshotJson && typeof first.refundHandoffSnapshotJson === "object"
					? (first.refundHandoffSnapshotJson as Record<string, unknown>)
					: null

			return {
				bookingId: first.bookingId,
				status: String(first.status ?? "draft"),
				currency,
				contractTotal,
				taxesTotal,
				commissionTotal,
				netPayoutEstimate: Math.max(0, contractTotal - commissionTotal),
				confirmedAt: first.confirmedAt ?? null,
				stay: {
					checkIn: dateOnly(first.checkInDate),
					checkOut: dateOnly(first.checkOutDate),
				},
				contract: {
					version: first.contractSnapshotVersion ?? "legacy_snapshot_compatibility",
					productName: first.productNameSnapshot ?? first.productName ?? null,
					variantName: first.variantNameSnapshot ?? first.variantName ?? null,
					ratePlanName: first.ratePlanNameSnapshot ?? null,
					snapshotFirst: Boolean(first.productNameSnapshot && first.variantNameSnapshot),
				},
				transactions: {
					paymentIntents: paymentIntents.length,
					settlementRecords: settlementRecords.length,
					refundRecords: refundRecords.length,
					statuses: [...new Set(shadows.map((row) => readStatus(row.payload)))],
				},
				refund: {
					state:
						reconciliationState === "handoff_pending"
							? "handoff_pending"
							: String(refundSnapshot?.state ?? "not_applicable"),
					owner: "Payments & Finance",
					boundary: "visibility_only",
				},
				payout: {
					state: settlementRecords.length > 0 ? "settlement_visibility" : "not_started",
					basis: "financial_shadow_record",
				},
				invoice: {
					state: "reference_not_issued",
					reference: null,
					basis: "booking_contract_snapshot",
				},
				taxFeeVisibility: {
					lines: taxByBooking.get(first.bookingId)?.length ?? 0,
					basis: "booking_tax_fee_snapshot",
				},
				reconciliation: {
					state: reconciliationState,
					basis: "snapshot_and_financial_shadow_visibility",
					owner: "Payments & Finance",
				},
			}
		})

		if (stateFilter !== "all") {
			items = items.filter((item) => item.reconciliation.state === stateFilter)
		}

		const summary = {
			totalBookings: items.length,
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
