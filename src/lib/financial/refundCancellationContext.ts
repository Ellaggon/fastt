import {
	first,
	and,
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	eq,
} from "@/shared/infrastructure/db/compat"

import type { RefundQuoteMoneyLine } from "@/modules/financial/public"
import type { HoldPolicyItemSnapshot, HoldPolicySnapshot } from "@/modules/policies/public"

export type RefundCancellationContext = {
	booking: {
		id: string
		providerId: string
		status: string
		currency: string
		grossAmount: number
		checkIn: string
		checkOut: string
		bookedAt: Date | null
	}
	policySnapshot: HoldPolicySnapshot
	lines: RefundQuoteMoneyLine[]
}

function dateOnly(value: unknown): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	const raw = String(value ?? "").trim()
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
	const parsed = new Date(raw)
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ""
}

function normalizedPolicyKey(category: unknown): keyof Omit<HoldPolicySnapshot, "meta"> | null {
	const normalized = String(category ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
	if (normalized.includes("cancel")) return "cancellation"
	if (normalized === "payment") return "payment"
	if (normalized === "noshow") return "no_show"
	if (normalized === "checkin") return "check_in"
	return null
}

function buildPolicySnapshot(params: {
	rows: Array<{ category: unknown; policySnapshotJson: unknown; policyId: unknown }>
	checkIn: string
	checkOut: string
}): HoldPolicySnapshot {
	const snapshot: HoldPolicySnapshot = {
		cancellation: null,
		payment: null,
		no_show: null,
		check_in: null,
		meta: {
			policyVersionIds: [],
			resolvedAt: new Date().toISOString(),
			checkIn: params.checkIn,
			checkOut: params.checkOut,
			channel: null,
		},
	}
	for (const row of params.rows) {
		const key = normalizedPolicyKey(row.category)
		const item =
			row.policySnapshotJson && typeof row.policySnapshotJson === "object"
				? (row.policySnapshotJson as HoldPolicyItemSnapshot)
				: null
		if (!key || !item) continue
		snapshot[key] = item as any
		const policyId = String(row.policyId ?? item.policyId ?? "").trim()
		if (policyId) snapshot.meta.policyVersionIds.push(policyId)
		if (!snapshot.meta.channel && item.source) {
			snapshot.meta.channel = null
		}
	}
	snapshot.meta.policyVersionIds = [...new Set(snapshot.meta.policyVersionIds)].sort()
	return snapshot
}

function roundMoney(value: number): number {
	return Math.round((Number(value) || 0) * 100) / 100
}

export async function loadRefundCancellationContext(params: {
	bookingId: string
	providerId: string
}): Promise<RefundCancellationContext | null> {
	const bookingId = String(params.bookingId ?? "").trim()
	const providerId = String(params.providerId ?? "").trim()
	if (!bookingId || !providerId) return null

	const booking = await db
		.select({
			id: Booking.id,
			providerId: Booking.providerId,
			status: Booking.status,
			currency: Booking.currency,
			totalAmount: Booking.totalAmount,
			checkInDate: Booking.checkInDate,
			checkOutDate: Booking.checkOutDate,
			bookingDate: Booking.bookingDate,
			confirmedAt: Booking.confirmedAt,
		})
		.from(Booking)
		.where(and(eq(Booking.id, bookingId), eq(Booking.providerId, providerId)))
		.then(first)
	if (!booking) return null

	const roomRows = await db
		.select({
			id: BookingRoomDetail.id,
			basePrice: BookingRoomDetail.subtotalAmount,
			taxes: BookingRoomDetail.taxAmount,
			totalPrice: BookingRoomDetail.totalAmount,
			checkIn: BookingRoomDetail.checkIn,
			checkOut: BookingRoomDetail.checkOut,
			providerIdSnapshot: BookingRoomDetail.providerIdSnapshot,
		})
		.from(BookingRoomDetail)
		.where(eq(BookingRoomDetail.bookingId, bookingId))

	if (!roomRows.length) return null

	const policyRows = await db
		.select({
			category: BookingPolicySnapshot.category,
			policyId: BookingPolicySnapshot.policyId,
			policySnapshotJson: BookingPolicySnapshot.policySnapshotJson,
		})
		.from(BookingPolicySnapshot)
		.where(eq(BookingPolicySnapshot.bookingId, bookingId))

	const taxRows = await db
		.select({
			totalAmount: BookingTaxFee.totalAmount,
		})
		.from(BookingTaxFee)
		.where(eq(BookingTaxFee.bookingId, bookingId))

	const currency =
		String(booking.currency ?? "USD")
			.trim()
			.toUpperCase() || "USD"
	const fallbackTotal = roomRows.reduce((sum, row) => sum + Number(row.totalPrice ?? 0), 0)
	const grossAmount = roundMoney(Number(booking.totalAmount ?? fallbackTotal))
	const taxAmount = roundMoney(
		roomRows.reduce((sum, row) => sum + Number(row.taxes ?? 0), 0) ||
			taxRows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0)
	)
	const baseAmount = roundMoney(Math.max(0, grossAmount - taxAmount))
	const firstRoom = roomRows[0]
	const checkIn = dateOnly(firstRoom?.checkIn ?? booking.checkInDate)
	const checkOut = dateOnly(firstRoom?.checkOut ?? booking.checkOutDate)

	return {
		booking: {
			id: String(booking.id),
			providerId,
			status: String(booking.status ?? "confirmed"),
			currency,
			grossAmount,
			checkIn,
			checkOut,
			bookedAt:
				booking.confirmedAt instanceof Date
					? booking.confirmedAt
					: booking.bookingDate instanceof Date
						? booking.bookingDate
						: null,
		},
		policySnapshot: buildPolicySnapshot({ rows: policyRows, checkIn, checkOut }),
		lines: [
			{
				type: "base",
				label: "Booked room amount",
				amount: baseAmount || grossAmount,
				basis: "booking_room_detail",
			},
			...(taxAmount > 0
				? [
						{
							type: "tax" as const,
							label: "Booked taxes and fees",
							amount: taxAmount,
							basis: "booking_tax_fee_snapshot",
						},
					]
				: []),
		],
	}
}
