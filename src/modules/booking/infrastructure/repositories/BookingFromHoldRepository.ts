import {
	first,
	and,
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	eq,
	Hold,
	InventoryLock,
	Product,
	RatePlan,
	sql,
	User,
	Variant,
} from "@/shared/infrastructure/db/compat"

import { cacheKeys } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import type {
	BookingFromHoldRepositoryPort,
	CreateBookingFromHoldInput,
	CreateBookingFromHoldResult,
	ResolveEffectiveTaxFeesFn,
} from "@/modules/booking/application/ports/BookingFromHoldRepositoryPort"
import type { HoldPolicySnapshot } from "@/modules/policies/public"
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"

type BookingPricingSnapshot = {
	ratePlanId: string
	currency: string
	occupancy: number
	occupancyDetail: {
		adults: number
		children: number
		infants: number
	}
	from: string
	to: string
	nights: number
	totalPrice: number
	days: Array<{
		date: string
		price: number
		pricingBreakdownV2?: {
			base: number
			occupancyAdjustment: number
			rules: number
			final: number
		}
		pricingSource?: "v2"
	}>
	pricingBreakdownV2?: {
		base: number
		occupancyAdjustment: number
		rules: number
		final: number
	}
	pricingSource?: "v2"
}

function isMissingHoldTableError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	return message.includes("no such table: Hold")
}

function compactName(parts: Array<string | null | undefined>): string | null {
	const value = parts
		.map((part) => String(part ?? "").trim())
		.filter(Boolean)
		.join(" ")
	return value || null
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
	const nights = Number(snapshot.nights ?? 0)
	const totalPrice = Number(snapshot.totalPrice ?? NaN)
	const occupancyDetailRaw = snapshot.occupancyDetail as
		| { adults?: unknown; children?: unknown; infants?: unknown }
		| undefined
	if (!occupancyDetailRaw || typeof occupancyDetailRaw !== "object") return null
	const occupancyDetail = {
		adults: Math.max(1, Number(occupancyDetailRaw?.adults ?? 1)),
		children: Math.max(0, Number(occupancyDetailRaw?.children ?? 0)),
		infants: Math.max(0, Number(occupancyDetailRaw?.infants ?? 0)),
	}
	const pricingBreakdownV2Raw = snapshot.pricingBreakdownV2 as
		| { base?: unknown; occupancyAdjustment?: unknown; rules?: unknown; final?: unknown }
		| undefined
	const pricingBreakdownV2 =
		pricingBreakdownV2Raw &&
		Number.isFinite(Number(pricingBreakdownV2Raw.base)) &&
		Number.isFinite(Number(pricingBreakdownV2Raw.occupancyAdjustment)) &&
		Number.isFinite(Number(pricingBreakdownV2Raw.rules)) &&
		Number.isFinite(Number(pricingBreakdownV2Raw.final))
			? {
					base: Number(pricingBreakdownV2Raw.base),
					occupancyAdjustment: Number(pricingBreakdownV2Raw.occupancyAdjustment),
					rules: Number(pricingBreakdownV2Raw.rules),
					final: Number(pricingBreakdownV2Raw.final),
				}
			: undefined
	const days = Array.isArray(snapshot.days)
		? snapshot.days
				.map((day) => ({
					date: String((day as any)?.date ?? "").trim(),
					price: Number((day as any)?.price ?? NaN),
					pricingBreakdownV2: (day as any)?.pricingBreakdownV2 as
						| { base?: unknown; occupancyAdjustment?: unknown; rules?: unknown; final?: unknown }
						| undefined,
					pricingSource: String((day as any)?.pricingSource ?? "").trim(),
				}))
				.filter((day) => day.date.length > 0 && Number.isFinite(day.price))
		: []
	if (!ratePlanId || !from || !to) return null
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
		occupancy: Math.max(1, Math.round(occupancyDetail.adults + occupancyDetail.children)),
		occupancyDetail: {
			adults: Math.max(1, Math.round(occupancyDetail.adults)),
			children: Math.max(0, Math.round(occupancyDetail.children)),
			infants: Math.max(0, Math.round(occupancyDetail.infants)),
		},
		from,
		to,
		nights: Math.max(1, Math.round(nights)),
		totalPrice: Number(totalPrice.toFixed(2)),
		days: days.map((day) => ({
			date: day.date,
			price: Number(day.price.toFixed(2)),
			pricingBreakdownV2:
				day.pricingBreakdownV2 &&
				Number.isFinite(Number(day.pricingBreakdownV2.base)) &&
				Number.isFinite(Number(day.pricingBreakdownV2.occupancyAdjustment)) &&
				Number.isFinite(Number(day.pricingBreakdownV2.rules)) &&
				Number.isFinite(Number(day.pricingBreakdownV2.final))
					? {
							base: Number(Number(day.pricingBreakdownV2.base).toFixed(2)),
							occupancyAdjustment: Number(
								Number(day.pricingBreakdownV2.occupancyAdjustment).toFixed(2)
							),
							rules: Number(Number(day.pricingBreakdownV2.rules).toFixed(2)),
							final: Number(Number(day.pricingBreakdownV2.final).toFixed(2)),
						}
					: undefined,
			pricingSource: day.pricingSource === "v2" ? "v2" : undefined,
		})),
		pricingBreakdownV2: pricingBreakdownV2
			? {
					base: Number(pricingBreakdownV2.base.toFixed(2)),
					occupancyAdjustment: Number(pricingBreakdownV2.occupancyAdjustment.toFixed(2)),
					rules: Number(pricingBreakdownV2.rules.toFixed(2)),
					final: Number(pricingBreakdownV2.final.toFixed(2)),
				}
			: undefined,
		pricingSource: snapshot.pricingSource === "v2" ? "v2" : undefined,
	}
}

export class BookingFromHoldRepository implements BookingFromHoldRepositoryPort {
	async createBookingFromHold(params: {
		resolveEffectiveTaxFees: ResolveEffectiveTaxFeesFn
		input: CreateBookingFromHoldInput
	}): Promise<CreateBookingFromHoldResult> {
		const holdId = String(params.input.holdId ?? "").trim()
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

			if (!holdRows.length) throw new Error("HOLD_NOT_FOUND")
			const holdDateRange = resolveHoldDateRange(
				holdRows.map((row) => ({ date: String(row.date ?? "") }))
			)
			if (!holdDateRange) throw new Error("HOLD_NOT_FOUND")

			const linkedBookingId = holdRows.find((row) => row.bookingId)?.bookingId
			if (linkedBookingId) {
				const existingBooking = await tx
					.select({ id: Booking.id, status: Booking.status })
					.from(Booking)
					.where(eq(Booking.id, linkedBookingId))
					.then(first)
				if (!existingBooking) throw new Error("HOLD_ALREADY_CONFIRMED")
				const variantId = String(holdRows[0].variantId)
				const variant = await tx
					.select({ productId: Variant.productId })
					.from(Variant)
					.where(eq(Variant.id, variantId))
					.then(first)
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
				.select({ productId: Variant.productId, variantName: Variant.name })
				.from(Variant)
				.where(eq(Variant.id, variantId))
				.then(first)
			if (!variant) throw new Error("HOLD_NOT_FOUND")

			const product = await tx
				.select({ id: Product.id, providerId: Product.providerId, productName: Product.name })
				.from(Product)
				.where(eq(Product.id, variant.productId))
				.then(first)
			if (!product) throw new Error("HOLD_NOT_FOUND")
			if (!product.providerId) throw new Error("PROVIDER_OWNERSHIP_REQUIRED")

			let holdSnapshot: HoldPolicySnapshot | null | undefined = null
			try {
				const hold = await tx
					.select({ policySnapshotJson: Hold.policySnapshotJson })
					.from(Hold)
					.where(eq(Hold.id, holdId))
					.then(first)
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

			const adults = Number(snapshot.occupancyDetail.adults ?? 1)
			const children = Number(snapshot.occupancyDetail.children ?? 0)
			const infants = Number(snapshot.occupancyDetail.infants ?? 0)
			const guests = Math.max(1, adults + children)
			const bookingId = crypto.randomUUID()
			const baseTotal = Number(snapshot.totalPrice)
			const ratePlanName = await resolveRatePlanNameColumn()
			const ratePlan = await tx
				.select({ name: ratePlanName })
				.from(RatePlan)
				.where(eq(RatePlan.id, snapshot.ratePlanId))
				.then(first)
			const guest = params.input.userId
				? await tx
						.select({
							email: User.email,
							firstName: User.firstName,
							lastName: User.lastName,
						})
						.from(User)
						.where(eq(User.id, params.input.userId))
						.then(first)
				: null
			const guestNameSnapshot = guest ? compactName([guest.firstName, guest.lastName]) : null
			const guestEmailSnapshot = String(guest?.email ?? "").trim() || null
			const lifecycleAuditSnapshot = {
				mode: "derived_visibility",
				createdAt: now.toISOString(),
				storedStatus: "confirmed",
				derivedStatesAreNotPersistedOperations: true,
			}
			const refundHandoffSnapshot = {
				state: "not_applicable",
				owner: "Payments & Finance",
				boundary: "visibility_only",
				reason: "Booking confirmation does not create a refund workflow.",
			}

			const taxResolved = await params.resolveEffectiveTaxFees({
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
			// Pricing total is sourced from the hold snapshot and must remain stable end-to-end.
			const finalTotal = Number(baseTotal.toFixed(2))

			await tx.insert(Booking).values({
				id: bookingId,
				providerId: product.providerId,
				userId: params.input.userId ?? null,
				ratePlanId: snapshot.ratePlanId,
				bookingDate: now,
				checkInDate: snapshot.from,
				checkOutDate: snapshot.to,
				numAdults: Math.max(1, adults),
				numChildren: Math.max(0, children),
				totalAmount: finalTotal,
				status: "confirmed",
				operationalStatus: "pending_arrival",
				currency: snapshot.currency,
				source: String(params.input.source ?? "web"),
				confirmedAt: now,
				guestEmailSnapshot,
				guestNameSnapshot,
				guestContactSnapshotJson: {
					email: guestEmailSnapshot,
					name: guestNameSnapshot,
					userId: params.input.userId ?? null,
				},
				lifecycleAuditJson: lifecycleAuditSnapshot,
				refundHandoffSnapshotJson: refundHandoffSnapshot,
				contractSnapshotVersion: "reservations_contract_snapshot_v1",
			} as any)

			await tx.insert(BookingRoomDetail).values({
				id: crypto.randomUUID(),
				bookingId,
				variantId,
				ratePlanId: snapshot.ratePlanId,
				checkIn: snapshot.from,
				checkOut: snapshot.to,
				adults: Math.max(1, adults),
				children: Math.max(0, children),
				subtotalAmount: Number(baseTotal.toFixed(2)),
				taxAmount: taxesAmount,
				totalAmount: finalTotal,
				pricingBreakdownJson: {
					nights: snapshot.days.map((day) => ({ date: day.date, price: day.price })),
					totalPrice: Number(baseTotal.toFixed(2)),
					currency: snapshot.currency,
					ratePlanId: snapshot.ratePlanId,
					occupancyDetail: {
						adults: Math.max(1, adults),
						children: Math.max(0, children),
						infants: Math.max(0, infants),
					},
					pricingBreakdownV2: snapshot.pricingBreakdownV2 ?? null,
					pricingSource: snapshot.pricingSource ?? null,
				},
				providerIdSnapshot: product.providerId ?? null,
				productIdSnapshot: product.id,
				productNameSnapshot: product.productName,
				variantNameSnapshot: variant.variantName,
				ratePlanNameSnapshot: ratePlan?.name ?? null,
				occupancySnapshotJson: {
					adults: Math.max(1, adults),
					children: Math.max(0, children),
					infants: Math.max(0, infants),
					label: `${Math.max(1, adults)} adults · ${Math.max(0, children)} children · ${Math.max(0, infants)} infants`,
				},
				createdAt: now,
			} as any)

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
					category: row.category,
					policyId: row.policyId,
					policySnapshotJson: row,
					createdAt: now,
				}))
			if (policyRows.length > 0) {
				await tx.insert(BookingPolicySnapshot).values(policyRows as any)
			}

			const taxLines = [
				...taxBreakdown.taxes.included,
				...taxBreakdown.taxes.excluded,
				...taxBreakdown.fees.included,
				...taxBreakdown.fees.excluded,
			]
			await tx.insert(BookingTaxFee).values(
				(taxLines.length > 0 ? taxLines : [null]).map((line) => ({
					id: crypto.randomUUID(),
					bookingId,
					name: line?.name ?? "Taxes and fees snapshot",
					breakdownJson: taxBreakdown,
					totalAmount: finalTotal,
					createdAt: now,
				})) as any
			)

			const consumeRes = await tx
				.update(InventoryLock)
				.set({ bookingId } as any)
				.where(and(eq(InventoryLock.holdId, holdId), sql`${InventoryLock.bookingId} is null`))
				.returning({ id: InventoryLock.id })

			const affected = Array.isArray(consumeRes)
				? consumeRes.length
				: Number((consumeRes as any)?.rowsAffected ?? (consumeRes as any)?.changes ?? 0)
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
}
