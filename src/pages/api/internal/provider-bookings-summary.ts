import type { APIRoute } from "astro"
import { and, Booking, BookingRoomDetail, db, desc, eq, Product, sql, Variant } from "astro:db"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

type LifecycleState =
	| "upcoming_arrival"
	| "in_house"
	| "departure_due"
	| "checked_out"
	| "cancelled"
	| "pending_confirmation"
	| "unknown"

type RefundHandoffState = "not_applicable" | "handoff_required" | "manual_review"

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

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

function deriveLifecycle(params: {
	status: string | null
	checkIn: string | null
	checkOut: string | null
}): { state: LifecycleState; label: string; basis: "stored_status" | "derived_from_snapshot" } {
	const status = String(params.status ?? "")
		.trim()
		.toLowerCase()
	if (status === "cancelled") {
		return { state: "cancelled", label: "Cancelled", basis: "stored_status" }
	}
	if (status !== "confirmed") {
		return { state: "pending_confirmation", label: "Pending confirmation", basis: "stored_status" }
	}

	const today = todayIso()
	const checkIn = params.checkIn
	const checkOut = params.checkOut
	if (!checkIn || !checkOut) {
		return { state: "unknown", label: "Snapshot incomplete", basis: "derived_from_snapshot" }
	}
	if (today < checkIn) {
		return { state: "upcoming_arrival", label: "Upcoming arrival", basis: "derived_from_snapshot" }
	}
	if (today === checkOut) {
		return { state: "departure_due", label: "Departure due", basis: "derived_from_snapshot" }
	}
	if (today > checkOut) {
		return { state: "checked_out", label: "Checked out", basis: "derived_from_snapshot" }
	}
	return { state: "in_house", label: "In-house", basis: "derived_from_snapshot" }
}

function readOccupancyDetail(snapshot: unknown): {
	adults: number
	children: number
	infants: number
} {
	const value = snapshot && typeof snapshot === "object" ? (snapshot as any).occupancyDetail : null
	return {
		adults: Math.max(0, Number(value?.adults ?? 0)),
		children: Math.max(0, Number(value?.children ?? 0)),
		infants: Math.max(0, Number(value?.infants ?? 0)),
	}
}

function countBy<T extends string>(items: Array<{ lifecycleState: T }>, state: T): number {
	return items.filter((item) => item.lifecycleState === state).length
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "provider-bookings-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const status = String(url.searchParams.get("status") ?? "all")
			.trim()
			.toLowerCase()
		const from = String(url.searchParams.get("from") ?? "").trim()
		const to = String(url.searchParams.get("to") ?? "").trim()

		const filters = [eq(Product.providerId, providerId)]
		if (status && status !== "all") {
			filters.push(eq(Booking.status, status))
		}
		if (from) {
			filters.push(sql`${Booking.checkInDate} >= ${from}`)
		}
		if (to) {
			filters.push(sql`${Booking.checkOutDate} <= ${to}`)
		}

		const rows = await db
			.select({
				bookingId: Booking.id,
				status: Booking.status,
				currency: Booking.currency,
				totalAmountUSD: Booking.totalAmountUSD,
				totalAmountBOB: Booking.totalAmountBOB,
				bookingDate: Booking.bookingDate,
				confirmedAt: Booking.confirmedAt,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				detailId: BookingRoomDetail.id,
				detailCheckIn: BookingRoomDetail.checkIn,
				detailCheckOut: BookingRoomDetail.checkOut,
				detailTotalPrice: BookingRoomDetail.totalPrice,
				detailVariantId: BookingRoomDetail.variantId,
				detailRatePlanId: BookingRoomDetail.ratePlanId,
				adults: BookingRoomDetail.adults,
				children: BookingRoomDetail.children,
				pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson,
				productId: Product.id,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(Booking)
			.leftJoin(BookingRoomDetail, eq(BookingRoomDetail.bookingId, Booking.id))
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(and(...filters))
			.orderBy(desc(Booking.bookingDate), desc(Booking.id))
			.all()

		const grouped = new Map<string, typeof rows>()
		for (const row of rows) {
			const bucket = grouped.get(row.bookingId) ?? []
			bucket.push(row)
			grouped.set(row.bookingId, bucket)
		}

		const items = Array.from(grouped.values()).map((group) => {
			const row = group[0]
			const currency = String(row.currency ?? "USD")
				.trim()
				.toUpperCase()
			const totalPrice =
				currency === "BOB"
					? Number(row.totalAmountBOB ?? row.detailTotalPrice ?? 0)
					: Number(row.totalAmountUSD ?? row.detailTotalPrice ?? 0)
			const checkIn = dateOnly(row.detailCheckIn ?? row.checkInDate)
			const checkOut = dateOnly(row.detailCheckOut ?? row.checkOutDate)
			const lifecycle = deriveLifecycle({ status: row.status, checkIn, checkOut })
			const firstSnapshot = group.find((item) => item.pricingBreakdownJson)?.pricingBreakdownJson
			const occupancyDetail = readOccupancyDetail(firstSnapshot)
			const roomCount = Math.max(1, group.filter((item) => item.detailId).length)
			const refundHandoffState: RefundHandoffState =
				lifecycle.state === "cancelled" ? "handoff_required" : "not_applicable"
			const hasSnapshot = Boolean(row.detailRatePlanId && firstSnapshot)

			return {
				bookingId: row.bookingId,
				productId: row.productId ?? null,
				productName: row.productName ?? null,
				variantId: row.detailVariantId ?? null,
				variantName: row.variantName ?? null,
				ratePlanId: row.detailRatePlanId ?? null,
				checkIn,
				checkOut,
				totalPrice,
				currency,
				status: String(row.status ?? "draft"),
				createdAt: row.bookingDate ? new Date(row.bookingDate).toISOString() : null,
				confirmedAt: row.confirmedAt ? new Date(row.confirmedAt).toISOString() : null,
				rooms: roomCount,
				occupancyDetail: {
					adults: occupancyDetail.adults || Number(row.adults ?? 0),
					children: occupancyDetail.children || Number(row.children ?? 0),
					infants: occupancyDetail.infants,
				},
				lifecycleState: lifecycle.state,
				lifecycleLabel: lifecycle.label,
				lifecycleBasis: lifecycle.basis,
				refundHandoffState,
				reconciliationState:
					refundHandoffState === "handoff_required" ? "handoff_pending" : "snapshot_ready",
				snapshotState: hasSnapshot ? "contract_snapshot_present" : "snapshot_incomplete",
			}
		})

		const summary = {
			total: items.length,
			upcomingArrivals: countBy(items, "upcoming_arrival"),
			inHouse: countBy(items, "in_house"),
			departuresDue: countBy(items, "departure_due"),
			checkedOut: countBy(items, "checked_out"),
			cancelled: countBy(items, "cancelled"),
			refundHandoffRequired: items.filter((item) => item.refundHandoffState === "handoff_required")
				.length,
			reconciliationPending: items.filter((item) => item.reconciliationState === "handoff_pending")
				.length,
			contractSnapshotsReady: items.filter(
				(item) => item.snapshotState === "contract_snapshot_present"
			).length,
			modificationWorkflow: "not_automated",
		}

		logEndpoint()
		return new Response(JSON.stringify({ summary, items }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		logEndpoint()
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
