import {
	and,
	db,
	DailyInventory,
	EffectivePricing,
	EffectiveRestriction,
	eq,
	gte,
	InventoryLock,
	lt,
	RatePlan,
	Variant,
	VariantCapacity,
} from "astro:db"
import { z } from "zod"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { readThrough } from "@/lib/cache/readThrough"
import { ensurePricingCoverageRuntime } from "@/modules/pricing/public"

const inputSchema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	occupancy: z.number().int().min(1),
	currency: z.string().min(1),
})

export type AvailabilityAggregateInput = z.infer<typeof inputSchema>

export type AvailabilityAggregateOutput = {
	days: Array<{
		date: string
		available: boolean
		capacity: number
		price: number | null
		minStay: number | null
		closed: boolean
		sellable: boolean
	}>
	missingPricingDates: string[]
	summary: {
		sellable: boolean
		totalPrice: number | null
		nights: number
	}
}

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function buildDateRange(fromIso: string, toIso: string): string[] {
	const start = parseDateOnly(fromIso)
	const end = parseDateOnly(toIso)
	const out: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

async function computeAvailabilityAggregate(
	input: AvailabilityAggregateInput
): Promise<AvailabilityAggregateOutput | null> {
	const nights = buildDateRange(input.dateRange.from, input.dateRange.to)
	if (!nights.length) return null

	const now = new Date()
	const hasEffectiveRestrictionTable = Boolean((EffectiveRestriction as any)?.date)
	const hasEffectivePricingTable = Boolean((EffectivePricing as any)?.date)

	const [variantRow, inventoryRows, holdsRows, restrictionRows] = await Promise.all([
		db
			.select({
				id: Variant.id,
				maxOccupancy: VariantCapacity.maxOccupancy,
			})
			.from(Variant)
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.where(eq(Variant.id, input.variantId))
			.get(),
		db
			.select({
				date: DailyInventory.date,
				totalInventory: DailyInventory.totalInventory,
				reservedCount: DailyInventory.reservedCount,
				stopSell: DailyInventory.stopSell,
			})
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, input.variantId),
					gte(DailyInventory.date, input.dateRange.from),
					lt(DailyInventory.date, input.dateRange.to)
				)
			)
			.all(),
		db
			.select({
				date: InventoryLock.date,
				quantity: InventoryLock.quantity,
			})
			.from(InventoryLock)
			.where(
				and(
					eq(InventoryLock.variantId, input.variantId),
					gte(InventoryLock.date, input.dateRange.from),
					lt(InventoryLock.date, input.dateRange.to),
					gte(InventoryLock.expiresAt, now)
				)
			)
			.all(),
		hasEffectiveRestrictionTable
			? db
					.select({
						date: EffectiveRestriction.date,
						minStay: EffectiveRestriction.minStay,
						stopSell: EffectiveRestriction.stopSell,
					})
					.from(EffectiveRestriction)
					.where(
						and(
							eq(EffectiveRestriction.variantId, input.variantId),
							gte(EffectiveRestriction.date, input.dateRange.from),
							lt(EffectiveRestriction.date, input.dateRange.to)
						)
					)
					.all()
			: Promise.resolve([] as Array<{ date: string; minStay: number | null; stopSell: boolean }>),
	])

	if (!variantRow) return null
	if (variantRow.maxOccupancy != null && input.occupancy > Number(variantRow.maxOccupancy)) {
		return {
			days: nights.map((date) => ({
				date,
				available: false,
				capacity: 0,
				price: null,
				minStay: null,
				closed: false,
				sellable: false,
			})),
			summary: {
				sellable: false,
				totalPrice: null,
				nights: nights.length,
			},
			missingPricingDates: nights,
		}
	}

	const defaultRatePlans = await db
		.select({ id: RatePlan.id, createdAt: RatePlan.createdAt })
		.from(RatePlan)
		.where(
			and(
				eq(RatePlan.variantId, input.variantId),
				eq(RatePlan.isDefault, true),
				eq(RatePlan.isActive, true)
			)
		)
		.all()
	const defaultRatePlan = defaultRatePlans.slice().sort((a, b) => {
		const at = new Date(a.createdAt as unknown as Date).getTime()
		const bt = new Date(b.createdAt as unknown as Date).getTime()
		if (Number.isNaN(at) && Number.isNaN(bt)) return 0
		if (Number.isNaN(at)) return 1
		if (Number.isNaN(bt)) return -1
		return at - bt
	})[0]
	if (defaultRatePlans.length > 1) {
		console.warn("multiple_default_rateplans_detected", {
			variantId: input.variantId,
			count: defaultRatePlans.length,
			ratePlanIds: defaultRatePlans.map((plan) => String(plan.id)),
		})
	}

	const effectivePriceRows =
		defaultRatePlan && hasEffectivePricingTable
			? await db
					.select({
						date: EffectivePricing.date,
						finalBasePrice: EffectivePricing.finalBasePrice,
					})
					.from(EffectivePricing)
					.where(
						and(
							eq(EffectivePricing.variantId, input.variantId),
							eq(EffectivePricing.ratePlanId, defaultRatePlan.id),
							gte(EffectivePricing.date, input.dateRange.from),
							lt(EffectivePricing.date, input.dateRange.to)
						)
					)
					.all()
			: []

	const inventoryByDate = new Map<
		string,
		{ totalInventory: number; reservedCount: number; stopSell: boolean }
	>(
		inventoryRows.map((row) => [
			String(row.date),
			{
				totalInventory: Number(row.totalInventory ?? 0),
				reservedCount: Number(row.reservedCount ?? 0),
				stopSell: Boolean(row.stopSell),
			},
		])
	)
	const holdsByDate = new Map<string, number>()
	for (const row of holdsRows) {
		const key = String(row.date)
		holdsByDate.set(key, Number(holdsByDate.get(key) ?? 0) + Number(row.quantity ?? 0))
	}
	const restrictionsByDate = new Map<string, { minStay: number | null; stopSell: boolean }>(
		restrictionRows.map((row) => [
			String(row.date),
			{
				minStay: row.minStay == null ? null : Number(row.minStay),
				stopSell: Boolean(row.stopSell),
			},
		])
	)
	const priceByDate = new Map<string, number>(
		effectivePriceRows.map((row) => [String(row.date), Number(row.finalBasePrice)])
	)
	const missingPricingDates = nights.filter((date) => !priceByDate.has(date))
	if (missingPricingDates.length > 0) {
		console.warn("pricing_coverage_gap_detected", {
			variantId: input.variantId,
			from: input.dateRange.from,
			to: input.dateRange.to,
			missingDatesCount: missingPricingDates.length,
		})
	}
	if (defaultRatePlan?.id && missingPricingDates.length > 0) {
		void ensurePricingCoverageRuntime({
			variantId: input.variantId,
			ratePlanId: String(defaultRatePlan.id),
			from: input.dateRange.from,
			to: input.dateRange.to,
		}).catch((error) => {
			console.warn("pricing_auto_heal_failed", {
				variantId: input.variantId,
				ratePlanId: String(defaultRatePlan.id),
				message: error instanceof Error ? error.message : String(error),
			})
		})
	}

	const days = nights.map((date) => {
		const inventory = inventoryByDate.get(date) ?? {
			totalInventory: 0,
			reservedCount: 0,
			stopSell: true,
		}
		const restriction = restrictionsByDate.get(date) ?? {
			minStay: null,
			stopSell: false,
		}
		const lockQty = Number(holdsByDate.get(date) ?? 0)
		const consumed = Math.max(Number(inventory.reservedCount ?? 0), lockQty)
		const capacity = Math.max(Number(inventory.totalInventory ?? 0) - consumed, 0)
		const closed = Boolean(inventory.stopSell || restriction.stopSell)
		const available = capacity >= input.occupancy && !closed
		const priceRaw = priceByDate.get(date)
		const price = priceRaw != null ? roundMoney(priceRaw) : null
		const minStay = restriction.minStay
		const minStayOk = minStay == null || nights.length >= minStay
		const sellable = Boolean(available && price !== null && minStayOk)

		return {
			date,
			available,
			capacity,
			price,
			minStay,
			closed,
			sellable,
		}
	})

	const rangeSellable = days.every((day) => day.sellable)
	const totalPrice = rangeSellable
		? roundMoney(days.reduce((acc, day) => acc + Number(day.price ?? 0), 0))
		: null

	return {
		days,
		missingPricingDates,
		summary: {
			sellable: rangeSellable,
			totalPrice,
			nights: nights.length,
		},
	}
}

export async function getAvailabilityAggregate(
	input: AvailabilityAggregateInput
): Promise<AvailabilityAggregateOutput | null> {
	const parsed = inputSchema.parse(input)
	const fromDate = parseDateOnly(parsed.dateRange.from)
	const toDate = parseDateOnly(parsed.dateRange.to)
	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
		throw new Error("Invalid date range")
	}

	const cacheKey = cacheKeys.availability(
		parsed.variantId,
		parsed.dateRange.from,
		parsed.dateRange.to,
		parsed.occupancy,
		parsed.currency
	)
	const startedAt = performance.now()
	let cacheHit = false

	try {
		const cached = await persistentCache.get<AvailabilityAggregateOutput>(cacheKey)
		if (cached !== null) {
			cacheHit = true
			console.debug("availability_aggregate", {
				variantId: parsed.variantId,
				durationMs: Number((performance.now() - startedAt).toFixed(1)),
				cacheHit,
			})
			return cached
		}
	} catch {
		cacheHit = false
	}

	const result = await readThrough(cacheKey, cacheTtls.availabilitySummary, async () =>
		computeAvailabilityAggregate(parsed)
	)

	console.debug("availability_aggregate", {
		variantId: parsed.variantId,
		durationMs: Number((performance.now() - startedAt).toFixed(1)),
		cacheHit,
	})

	return result
}
