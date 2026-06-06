import type { APIRoute } from "astro"
import {
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	eq,
	Product,
	User,
	Variant,
} from "astro:db"

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
}): {
	state: LifecycleState
	label: string
	basis: "stored_status" | "derived_visibility"
	reality: "persisted_status" | "date_derived_visibility"
} {
	const status = String(params.status ?? "")
		.trim()
		.toLowerCase()
	if (status === "cancelled")
		return {
			state: "cancelled",
			label: "Cancelled",
			basis: "stored_status",
			reality: "persisted_status",
		}
	if (status !== "confirmed") {
		return {
			state: "pending_confirmation",
			label: "Pending confirmation",
			basis: "stored_status",
			reality: "persisted_status",
		}
	}
	const today = todayIso()
	if (!params.checkIn || !params.checkOut) {
		return {
			state: "unknown",
			label: "Snapshot incomplete",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	if (today < params.checkIn) {
		return {
			state: "upcoming_arrival",
			label: "Upcoming arrival",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	if (today === params.checkOut) {
		return {
			state: "departure_due",
			label: "Departure due",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	if (today > params.checkOut) {
		return {
			state: "checked_out",
			label: "Checked out",
			basis: "derived_visibility",
			reality: "date_derived_visibility",
		}
	}
	return {
		state: "in_house",
		label: "In-house",
		basis: "derived_visibility",
		reality: "date_derived_visibility",
	}
}

function readOccupancyDetail(snapshot: unknown, fallback: { adults: number; children: number }) {
	const value = snapshot && typeof snapshot === "object" ? (snapshot as any).occupancyDetail : null
	return {
		adults: Math.max(0, Number(value?.adults ?? fallback.adults ?? 0)),
		children: Math.max(0, Number(value?.children ?? fallback.children ?? 0)),
		infants: Math.max(0, Number(value?.infants ?? 0)),
	}
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "booking-summary"
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

		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const booking = await db
			.select({
				id: Booking.id,
				userId: Booking.userId,
				guestEmail: User.email,
				guestFirstName: User.firstName,
				guestLastName: User.lastName,
				guestEmailSnapshot: Booking.guestEmailSnapshot,
				guestNameSnapshot: Booking.guestNameSnapshot,
				guestContactSnapshotJson: Booking.guestContactSnapshotJson,
				lifecycleAuditJson: Booking.lifecycleAuditJson,
				refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
				contractSnapshotVersion: Booking.contractSnapshotVersion,
				ratePlanId: Booking.ratePlanId,
				status: Booking.status,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				currency: Booking.currency,
				totalAmountUSD: Booking.totalAmountUSD,
				totalAmountBOB: Booking.totalAmountBOB,
				numAdults: Booking.numAdults,
				numChildren: Booking.numChildren,
				bookingDate: Booking.bookingDate,
				confirmedAt: Booking.confirmedAt,
				source: Booking.source,
			})
			.from(Booking)
			.leftJoin(User, eq(User.id, Booking.userId))
			.where(eq(Booking.id, bookingId))
			.get()

		if (!booking) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const roomRows = await db
			.select({
				id: BookingRoomDetail.id,
				variantId: BookingRoomDetail.variantId,
				ratePlanId: BookingRoomDetail.ratePlanId,
				checkIn: BookingRoomDetail.checkIn,
				checkOut: BookingRoomDetail.checkOut,
				adults: BookingRoomDetail.adults,
				children: BookingRoomDetail.children,
				bookedSubtotal: BookingRoomDetail.basePrice,
				taxes: BookingRoomDetail.taxes,
				totalPrice: BookingRoomDetail.totalPrice,
				pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson,
				providerIdSnapshot: BookingRoomDetail.providerIdSnapshot,
				productIdSnapshot: BookingRoomDetail.productIdSnapshot,
				productNameSnapshot: BookingRoomDetail.productNameSnapshot,
				variantNameSnapshot: BookingRoomDetail.variantNameSnapshot,
				ratePlanNameSnapshot: BookingRoomDetail.ratePlanNameSnapshot,
				occupancySnapshotJson: BookingRoomDetail.occupancySnapshotJson,
				productId: Product.id,
				providerId: Product.providerId,
				productName: Product.name,
				variantName: Variant.name,
			})
			.from(BookingRoomDetail)
			.leftJoin(Variant, eq(Variant.id, BookingRoomDetail.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(BookingRoomDetail.bookingId, bookingId))
			.all()

		if (
			!roomRows.length ||
			!roomRows.some((row) => row.productIdSnapshot || (row.productId && row.productId.length > 0))
		) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (
			!roomRows.some(
				(row) => row.providerIdSnapshot === providerId || row.providerId === providerId
			)
		) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const taxLines = await db
			.select({
				id: BookingTaxFee.id,
				name: BookingTaxFee.name,
				totalAmount: BookingTaxFee.totalAmount,
				breakdownJson: BookingTaxFee.breakdownJson,
				createdAt: BookingTaxFee.createdAt,
			})
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()

		const policyRows = await db
			.select({
				id: BookingPolicySnapshot.id,
				category: BookingPolicySnapshot.category,
				policyId: BookingPolicySnapshot.policyId,
				policySnapshotJson: BookingPolicySnapshot.policySnapshotJson,
				createdAt: BookingPolicySnapshot.createdAt,
			})
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))
			.all()

		const firstRoom = roomRows[0]
		const checkIn = dateOnly(firstRoom?.checkIn ?? booking.checkInDate)
		const checkOut = dateOnly(firstRoom?.checkOut ?? booking.checkOutDate)
		const lifecycle = deriveLifecycle({ status: booking.status, checkIn, checkOut })
		const currency = String(booking.currency ?? "USD")
			.trim()
			.toUpperCase()
		const total =
			currency === "BOB"
				? Number(booking.totalAmountBOB ?? firstRoom?.totalPrice ?? 0)
				: Number(booking.totalAmountUSD ?? firstRoom?.totalPrice ?? 0)

		const allocations = roomRows.map((row, index) => {
			const occupancyDetail = readOccupancyDetail(
				row.occupancySnapshotJson ?? row.pricingBreakdownJson,
				{
					adults: Number(row.adults ?? 0),
					children: Number(row.children ?? 0),
				}
			)
			return {
				allocationId: row.id,
				sequence: index + 1,
				productId: row.productIdSnapshot ?? row.productId ?? null,
				productName: row.productNameSnapshot ?? row.productName ?? null,
				variantId: row.variantId ?? null,
				variantName: row.variantNameSnapshot ?? row.variantName ?? null,
				ratePlanId: row.ratePlanId ?? booking.ratePlanId ?? null,
				ratePlanName: row.ratePlanNameSnapshot ?? null,
				checkIn: dateOnly(row.checkIn),
				checkOut: dateOnly(row.checkOut),
				occupancyDetail,
				occupancySnapshot: row.occupancySnapshotJson ?? null,
				bookedSubtotal: Number(row.bookedSubtotal ?? 0),
				taxes: Number(row.taxes ?? 0),
				totalPrice: Number(row.totalPrice ?? 0),
				pricingSnapshot: row.pricingBreakdownJson ?? null,
			}
		})

		const snapshotIntegrity = {
			hasRatePlanId: Boolean(booking.ratePlanId || allocations.some((row) => row.ratePlanId)),
			hasPricingBreakdown: allocations.every((row) => Boolean(row.pricingSnapshot)),
			hasPolicySnapshot: policyRows.length > 0,
			hasTaxSnapshot: taxLines.length > 0,
			hasOccupancyDetail: allocations.every(
				(row) => row.occupancyDetail.adults + row.occupancyDetail.children > 0
			),
			hasTextualSnapshot: allocations.every(
				(row) => Boolean(row.productName) && Boolean(row.variantName) && Boolean(row.ratePlanName)
			),
			hasGuestSnapshot: Boolean(booking.guestEmailSnapshot || booking.guestContactSnapshotJson),
			source: "booking_contract_snapshot",
		}

		const refundHandoffSnapshot =
			booking.refundHandoffSnapshotJson && typeof booking.refundHandoffSnapshotJson === "object"
				? (booking.refundHandoffSnapshotJson as Record<string, unknown>)
				: null
		const refundHandoff =
			lifecycle.state === "cancelled"
				? {
						state: "handoff_required",
						label: "Refund handoff visibility",
						owner: "Payments & Finance",
						boundary: "visibility_only",
						description:
							"Cancellation is visible to Reservations. Refund execution remains a Finance/Payments handoff, not a booking recompute.",
					}
				: {
						state: String(refundHandoffSnapshot?.state ?? "not_applicable"),
						label: "No refund handoff",
						owner: "Payments & Finance",
						boundary: "visibility_only",
						description:
							"No refund workflow is active for this snapshot. Payments orchestration is intentionally outside Reservations.",
					}
		const guestContactSnapshot =
			booking.guestContactSnapshotJson && typeof booking.guestContactSnapshotJson === "object"
				? (booking.guestContactSnapshotJson as Record<string, unknown>)
				: null
		const liveGuestName = [booking.guestFirstName, booking.guestLastName]
			.map((part) => String(part ?? "").trim())
			.filter(Boolean)
			.join(" ")

		logEndpoint()
		return new Response(
			JSON.stringify({
				booking: {
					id: booking.id,
					status: booking.status ?? "confirmed",
					checkIn,
					checkOut,
					currency,
					total,
					confirmedAt: booking.confirmedAt,
					createdAt: booking.bookingDate ?? booking.confirmedAt ?? null,
					source: booking.source ?? "web",
					ratePlanId: booking.ratePlanId ?? null,
					guestSnapshot: {
						userId: booking.userId ?? null,
						name:
							booking.guestNameSnapshot ??
							(String(guestContactSnapshot?.name ?? "").trim() || liveGuestName || null),
						email:
							booking.guestEmailSnapshot ??
							(String(guestContactSnapshot?.email ?? "").trim() || (booking.guestEmail ?? null)),
						adults: Number(booking.numAdults ?? 0),
						children: Number(booking.numChildren ?? 0),
						source: booking.guestContactSnapshotJson ? "contract_snapshot" : "live_user_fallback",
					},
					rooms: allocations.length,
					lifecycle,
					refundHandoff,
					reconciliation: {
						state:
							refundHandoff.state === "handoff_required"
								? "handoff_pending"
								: refundHandoff.state === "not_applicable"
									? "not_required"
									: "unknown",
						owner: "Payments & Finance",
						boundary: "handoff_visibility_only",
					},
					snapshotIntegrity,
					lifecycleAudit:
						booking.lifecycleAuditJson && typeof booking.lifecycleAuditJson === "object"
							? booking.lifecycleAuditJson
							: {
									mode: "derived_visibility",
									storedStatus: booking.status ?? null,
									derivedStatesAreNotPersistedOperations: true,
								},
					contractSnapshotVersion:
						booking.contractSnapshotVersion ?? "missing_contract_snapshot_version",
				},
				allocations,
				taxes: taxLines.map((line) => ({
					id: line.id,
					name: line.name ?? "Taxes and fees snapshot",
					totalAmount: Number(line.totalAmount ?? 0),
					breakdown: line.breakdownJson ?? null,
					createdAt: line.createdAt ?? null,
				})),
				policies: policyRows.map((line) => {
					const snapshot = (line.policySnapshotJson ?? null) as any
					return {
						id: line.id,
						policyType: line.category ?? snapshot?.category ?? "policy",
						description: snapshot?.description ?? null,
						policyId: line.policyId ?? null,
						snapshot,
						createdAt: line.createdAt ?? null,
					}
				}),
				modifications: {
					state: "not_automated",
					label: "No modification workflow captured",
					description:
						"This release exposes the confirmed contract snapshot. Modification operations are not represented as a live state machine yet.",
				},
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		logEndpoint()
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
