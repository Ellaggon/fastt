import {
	and,
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	BookingTaxFee,
	db,
	EffectivePricing,
	eq,
	InventoryLock,
	PricingBaseRate,
	RatePlan,
	sql,
	Variant,
} from "astro:db"

import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import type { ResolvedTaxFeeDefinition } from "@/modules/taxes-fees/public"

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
}

async function buildSnapshotFromHoldLifecycle(params: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
	variantId: string
	holdRows: Array<{ date: string; quantity: number }>
}): Promise<BookingPricingSnapshot | null> {
	const sortedDates = params.holdRows
		.map((row) => String(row.date))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b))
	if (!sortedDates.length) return null

	const from = sortedDates[0]
	const lastDate = sortedDates[sortedDates.length - 1]
	const checkOutDate = new Date(`${lastDate}T00:00:00.000Z`)
	checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 1)
	const to = checkOutDate.toISOString().slice(0, 10)
	const occupancy = Math.max(
		1,
		...params.holdRows
			.map((row) => Number(row.quantity || 1))
			.filter((value) => Number.isFinite(value))
	)

	const defaultPlans = await params.tx
		.select({ id: RatePlan.id, createdAt: RatePlan.createdAt })
		.from(RatePlan)
		.where(
			and(
				eq(RatePlan.variantId, params.variantId),
				eq(RatePlan.isDefault, true),
				eq(RatePlan.isActive, true)
			)
		)
		.all()
	if (!defaultPlans.length) return null
	if (defaultPlans.length > 1) {
		console.warn("multiple_default_rateplans_detected", {
			variantId: params.variantId,
			count: defaultPlans.length,
			ratePlanIds: defaultPlans.map((plan) => String(plan.id)),
		})
	}
	const defaultRatePlan = defaultPlans.slice().sort((a, b) => {
		const at = new Date(a.createdAt as unknown as Date).getTime()
		const bt = new Date(b.createdAt as unknown as Date).getTime()
		if (Number.isNaN(at) && Number.isNaN(bt)) return 0
		if (Number.isNaN(at)) return 1
		if (Number.isNaN(bt)) return -1
		return at - bt
	})[0]

	const pricingRows = await params.tx
		.select({
			date: EffectivePricing.date,
			price: EffectivePricing.finalBasePrice,
		})
		.from(EffectivePricing)
		.where(
			and(
				eq(EffectivePricing.variantId, params.variantId),
				eq(EffectivePricing.ratePlanId, String(defaultRatePlan.id))
			)
		)
		.all()
	const priceByDate = new Map(pricingRows.map((row) => [String(row.date), Number(row.price)]))

	const days = sortedDates.map((date) => {
		const price = Number(priceByDate.get(date))
		if (!Number.isFinite(price)) return null
		return { date, price }
	})
	if (days.some((day) => !day)) return null
	const resolvedDays = days.filter((day): day is { date: string; price: number } => Boolean(day))
	const totalPrice = Number(resolvedDays.reduce((sum, day) => sum + day.price, 0).toFixed(2))
	const baseRate = await params.tx
		.select({ currency: PricingBaseRate.currency })
		.from(PricingBaseRate)
		.where(eq(PricingBaseRate.variantId, params.variantId))
		.get()

	return {
		ratePlanId: String(defaultRatePlan.id),
		currency: String(baseRate?.currency ?? "USD"),
		occupancy,
		from,
		to,
		nights: resolvedDays.length,
		totalPrice,
		days: resolvedDays,
	}
}

export async function createBookingFromHold(
	deps: {
		resolveEffectivePolicies: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			channel?: string
		}) => Promise<{
			policies: Array<{
				category: string
				policy: {
					id: string
					groupId: string
					description: string
					version: number
					status: "active"
					effectiveFrom?: string | null
					effectiveTo?: string | null
					rules: unknown[]
					cancellationTiers: unknown[]
				}
				resolvedFromScope: string
			}>
		}>
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
	if (!holdId) throw new Error("hold_id_required")

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

		if (!holdRows.length) throw new Error("hold_not_found")

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
			if (!existingBooking) throw new Error("booking_not_found")
			const variantId = String(holdRows[0].variantId)
			const variant = await tx
				.select({ productId: Variant.productId })
				.from(Variant)
				.where(eq(Variant.id, variantId))
				.get()
			if (!variant) throw new Error("variant_not_found")
			return {
				bookingId: existingBooking.id,
				status: existingBooking.status ?? "confirmed",
				idempotent: true,
				variantId,
				productId: variant.productId,
			}
		}

		const now = new Date()
		if (holdRows.some((row) => new Date(row.expiresAt) < now)) {
			throw new Error("hold_expired")
		}

		const variantIds = [...new Set(holdRows.map((row) => String(row.variantId)).filter(Boolean))]
		if (variantIds.length !== 1) throw new Error("hold_invalid_variant")
		const variantId = variantIds[0]

		const variant = await tx
			.select({ productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, variantId))
			.get()
		if (!variant) throw new Error("variant_not_found")

		const snapshot = await buildSnapshotFromHoldLifecycle({
			tx,
			variantId,
			holdRows: holdRows.map((row) => ({
				date: String(row.date),
				quantity: Number(row.quantity ?? 1),
			})),
		})
		if (!snapshot) throw new Error("pricing_not_available")
		console.debug("booking_snapshot_built", {
			holdId,
			nights: snapshot.nights,
			totalPrice: snapshot.totalPrice,
		})

		const lockDates = new Set(holdRows.map((row) => String(row.date)))
		const snapshotDates = new Set(snapshot.days.map((day) => day.date))
		for (const lockDate of lockDates) {
			if (!snapshotDates.has(lockDate)) throw new Error("pricing_not_available")
		}

		const ratePlan = await tx
			.select({ id: RatePlan.id, variantId: RatePlan.variantId })
			.from(RatePlan)
			.where(eq(RatePlan.id, snapshot.ratePlanId))
			.get()
		if (!ratePlan || String(ratePlan.variantId) !== variantId) {
			throw new Error("pricing_not_available")
		}

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

		const resolvedPolicies = await deps.resolveEffectivePolicies({
			productId: variant.productId,
			variantId,
			ratePlanId: snapshot.ratePlanId,
			channel: "web",
		})

		if (resolvedPolicies.policies.length > 0) {
			await tx
				.insert(BookingPolicySnapshot)
				.values(
					resolvedPolicies.policies.map((policy) => ({
						id: crypto.randomUUID(),
						bookingId,
						policyType: policy.category,
						description: policy.policy.description,
						cancellationJson: null,
						category: policy.category,
						policyId: policy.policy.id,
						policySnapshotJson: {
							category: policy.category,
							resolvedFromScope: policy.resolvedFromScope,
							policy: policy.policy,
						},
						createdAt: now,
					})) as any
				)
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
			throw new Error("hold_already_consumed")
		}

		return {
			bookingId,
			status: "confirmed",
			idempotent: false,
			variantId,
			productId: variant.productId,
		}
	})
}
