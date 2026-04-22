import {
	and,
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	eq,
	Hold,
	InventoryLock,
	sql,
	Variant,
} from "astro:db"

import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import type { ResolvedTaxFeeDefinition } from "@/modules/taxes-fees/public"
import * as persistentCache from "@/lib/cache/persistentCache"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import type { HoldPolicySnapshot } from "@/modules/policies/public"

function isMissingHoldTableError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return message.includes("no such table: Hold")
}

type BookingPricingSnapshot = {
	ratePlanId: string
	currency: string
	occupancy: number
	from: string
	to: string
	nights: number
	totalPrice: number
	days: Array<{ date: string; price: number }>
}

export type CreateBookingFromHoldInput = {
	holdId: string
	userId?: string | null
	source?: string | null
}

export type CreateBookingFromHoldResult = {
	bookingId: string
	status: string
	idempotent: boolean
	variantId: string
	productId: string
	availabilityRange: {
		from: string
		to: string
	}
}

function resolveHoldDateRange(
	holdRows: Array<{ date: string }>
): { from: string; to: string } | null {
	const sortedDates = holdRows
		.map((row) => String(row.date))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))
	if (!sortedDates.length) return null
	const from = sortedDates[0]
	const lastDate = sortedDates[sortedDates.length - 1]
	const checkOutDate = new Date(`${lastDate}T00:00:00.000Z`)
	checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 1)
	return { from, to: checkOutDate.toISOString().slice(0, 10) }
}

async function buildSnapshotFromHoldLifecycle(params: {
	holdId: string
	holdRows: Array<{ date: string; quantity: number }>
}): Promise<BookingPricingSnapshot | null> {
	const snapshotRaw = await persistentCache.get(cacheKeys.holdPricingSnapshot(params.holdId))
	if (!snapshotRaw || typeof snapshotRaw !== "object") return null
	const snapshot = snapshotRaw as Partial<BookingPricingSnapshot>

	const ratePlanId = String(snapshot.ratePlanId ?? "").trim()
	const currency = String(snapshot.currency ?? "USD").trim() || "USD"
	const from = String(snapshot.from ?? "").trim()
	const to = String(snapshot.to ?? "").trim()
	const occupancy = Number(snapshot.occupancy ?? 0)
	const nights = Number(snapshot.nights ?? 0)
	const totalPrice = Number(snapshot.totalPrice ?? NaN)
	const days = Array.isArray(snapshot.days)
		? snapshot.days
				.map((day) => ({
					date: String((day as any)?.date ?? "").trim(),
					price: Number((day as any)?.price ?? NaN),
				}))
				.filter((day) => day.date.length > 0 && Number.isFinite(day.price))
		: []
	if (!ratePlanId || !from || !to) return null
	if (!Number.isFinite(occupancy) || occupancy < 1) return null
	if (!Number.isFinite(nights) || nights < 1) return null
	if (!Number.isFinite(totalPrice) || totalPrice <= 0) return null
	if (!days.length) return null

	const lockDates = new Set(params.holdRows.map((row) => String(row.date)))
	const snapshotDates = new Set(days.map((day) => day.date))
	for (const lockDate of lockDates) {
		if (!snapshotDates.has(lockDate)) return null
	}

	return {
		ratePlanId,
		currency,
		occupancy: Math.max(1, Math.round(occupancy)),
		from,
		to,
		nights: Math.max(1, Math.round(nights)),
		totalPrice: Number(totalPrice.toFixed(2)),
		days: days.map((day) => ({ date: day.date, price: Number(day.price.toFixed(2)) })),
	}
}

export async function createBookingFromHold(
	deps: {
		resolveEffectiveTaxFees: (params: {
			providerId?: string
			productId?: string
			variantId?: string
			ratePlanId?: string
			channel?: string | null
		}) => Promise<{
			definitions: ResolvedTaxFeeDefinition[]
		}>
	},
	input: CreateBookingFromHoldInput
): Promise<CreateBookingFromHoldResult> {
	const holdId = String(input.holdId ?? "").trim()
	if (!holdId) throw new Error("HOLD_NOT_FOUND")

	return db.transaction(async (tx) => {
		const holdRows = await tx
			.select({
				id: InventoryLock.id,
				holdId: InventoryLock.holdId,
				variantId: InventoryLock.variantId,
				date: InventoryLock.date,
				quantity: InventoryLock.quantity,
				expiresAt: InventoryLock.expiresAt,
				bookingId: InventoryLock.bookingId,
			})
			.from(InventoryLock)
			.where(eq(InventoryLock.holdId, holdId))
			.all()

		if (!holdRows.length) throw new Error("HOLD_NOT_FOUND")
		const holdDateRange = resolveHoldDateRange(
			holdRows.map((row) => ({ date: String(row.date ?? "") }))
		)
		if (!holdDateRange) throw new Error("HOLD_NOT_FOUND")

		const linkedBookingId = holdRows.find((row) => row.bookingId)?.bookingId
		if (linkedBookingId) {
			const existingBooking = await tx
				.select({
					id: Booking.id,
					status: Booking.status,
				})
				.from(Booking)
				.where(eq(Booking.id, linkedBookingId))
				.get()
			if (!existingBooking) throw new Error("HOLD_ALREADY_CONFIRMED")
			const variantId = String(holdRows[0].variantId)
			const variant = await tx
				.select({ productId: Variant.productId })
				.from(Variant)
				.where(eq(Variant.id, variantId))
				.get()
			if (!variant) throw new Error("HOLD_NOT_FOUND")
			return {
				bookingId: existingBooking.id,
				status: existingBooking.status ?? "confirmed",
				idempotent: true,
				variantId,
				productId: variant.productId,
				availabilityRange: holdDateRange,
			}
		}

		const now = new Date()
		if (holdRows.some((row) => new Date(row.expiresAt) < now)) {
			throw new Error("HOLD_EXPIRED")
		}

		const variantIds = [...new Set(holdRows.map((row) => String(row.variantId)).filter(Boolean))]
		if (variantIds.length !== 1) throw new Error("INVENTORY_CONFLICT")
		const variantId = variantIds[0]

		const variant = await tx
			.select({ productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.get()
		if (!variant) throw new Error("HOLD_NOT_FOUND")

		let holdSnapshot: HoldPolicySnapshot | null | undefined = null
		try {
			const hold = await tx
				.select({
					policySnapshotJson: Hold.policySnapshotJson,
				})
				.from(Hold)
				.where(eq(Hold.id, holdId))
				.get()
			holdSnapshot = hold?.policySnapshotJson as HoldPolicySnapshot | null | undefined
		} catch (error) {
			if (!isMissingHoldTableError(error)) throw error
		}
		if (!holdSnapshot || typeof holdSnapshot !== "object") {
			const cached = await persistentCache.get(cacheKeys.holdPolicySnapshot(holdId))
			if (cached && typeof cached === "object") {
				holdSnapshot = cached as HoldPolicySnapshot
			}
		}
		if (!holdSnapshot || typeof holdSnapshot !== "object") {
			throw new Error("INVENTORY_CONFLICT")
		}

		const snapshot = await buildSnapshotFromHoldLifecycle({
			holdId,
			holdRows: holdRows.map((row) => ({
				date: String(row.date),
				quantity: Number(row.quantity ?? 1),
			})),
		})
		if (!snapshot) throw new Error("INVENTORY_CONFLICT")
		console.debug("booking_snapshot_built", {
			holdId,
			nights: snapshot.nights,
			totalPrice: snapshot.totalPrice,
		})

		const guests = Number(snapshot.occupancy)
		const bookingId = crypto.randomUUID()
		const baseTotal = Number(snapshot.totalPrice)

		const taxResolved = await deps.resolveEffectiveTaxFees({
			productId: variant.productId,
			variantId,
			ratePlanId: snapshot.ratePlanId,
			channel: "web",
		})
		const taxBreakdown = computeTaxBreakdown({
			base: baseTotal,
			definitions: taxResolved.definitions,
			nights: snapshot.nights,
			guests,
		})
		const taxesAmount = Number((taxBreakdown.total - taxBreakdown.base).toFixed(2))
		const finalTotal = Number(taxBreakdown.total.toFixed(2))

		await tx
			.insert(Booking)
			.values({
				id: bookingId,
				userId: input.userId ?? null,
				ratePlanId: snapshot.ratePlanId,
				bookingDate: now,
				checkInDate: new Date(`${snapshot.from}T00:00:00.000Z`),
				checkOutDate: new Date(`${snapshot.to}T00:00:00.000Z`),
				numAdults: guests,
				numChildren: 0,
				totalAmountUSD: snapshot.currency === "USD" ? finalTotal : null,
				totalAmountBOB: snapshot.currency === "BOB" ? finalTotal : null,
				status: "confirmed",
				currency: snapshot.currency,
				source: String(input.source ?? "web"),
				confirmedAt: now,
			} as any)
			.run()

		await tx
			.insert(BookingRoomDetail)
			.values({
				id: crypto.randomUUID(),
				bookingId,
				variantId,
				ratePlanId: snapshot.ratePlanId,
				checkIn: snapshot.from,
				checkOut: snapshot.to,
				adults: guests,
				children: 0,
				basePrice: Number(baseTotal.toFixed(2)),
				taxes: taxesAmount,
				totalPrice: finalTotal,
				pricingBreakdownJson: {
					nights: snapshot.days.map((day) => ({ date: day.date, price: day.price })),
					totalPrice: Number(baseTotal.toFixed(2)),
					currency: snapshot.currency,
					ratePlanId: snapshot.ratePlanId,
				},
				createdAt: now,
			} as any)
			.run()

		const policyRows = [
			holdSnapshot.cancellation,
			holdSnapshot.payment,
			holdSnapshot.no_show,
			holdSnapshot.check_in,
		]
			.filter((row): row is NonNullable<typeof row> => Boolean(row))
			.map((row) => ({
				id: crypto.randomUUID(),
				bookingId,
				policyType: row.category,
				description: row.description,
				cancellationJson: null,
				category: row.category,
				policyId: row.policyId,
				policySnapshotJson: row,
				createdAt: now,
			}))
		if (policyRows.length > 0) {
			await tx
				.insert(BookingPolicySnapshot)
				.values(policyRows as any)
				.run()
		}

		const taxLines = [
			...taxBreakdown.taxes.included,
			...taxBreakdown.taxes.excluded,
			...taxBreakdown.fees.included,
			...taxBreakdown.fees.excluded,
		]
		await tx
			.insert(BookingTaxFee)
			.values(
				(taxLines.length > 0 ? taxLines : [null]).map((line) => ({
					id: crypto.randomUUID(),
					bookingId,
					lineJson: line,
					breakdownJson: taxBreakdown,
					totalAmount: finalTotal,
					createdAt: now,
				})) as any
			)
			.run()

		const consumeRes = await tx
			.update(InventoryLock)
			.set({ bookingId } as any)
			.where(and(eq(InventoryLock.holdId, holdId), sql`${InventoryLock.bookingId} is null`))
			.run()
		const affected = Number((consumeRes as any)?.rowsAffected ?? (consumeRes as any)?.changes ?? 0)
		if (affected !== holdRows.length) {
			throw new Error("HOLD_ALREADY_CONFIRMED")
		}

		return {
			bookingId,
			status: "confirmed",
			idempotent: false,
			variantId,
			productId: variant.productId,
			availabilityRange: holdDateRange,
		}
	})
}
