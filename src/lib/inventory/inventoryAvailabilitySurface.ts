import { and, db, eq, gte, lt, SearchUnitView } from "@/shared/infrastructure/db/compat"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { buildOccupancyKey, evaluateStaySellabilityFromView } from "@/modules/search/public"

type InventoryAvailabilityDay = {
	date: string
	available: boolean
	capacity: number
	price: number | null
	minStay: number | null
	closed: boolean
	sellable: boolean
	unsellableReason: string | null
}

export type InventoryAvailabilitySurface = {
	days: InventoryAvailabilityDay[]
	missingPricingDates: string[]
	summary: {
		sellable: boolean
		totalPrice: number | null
		nights: number
		primaryBlocker: string | null
	}
}

export type InventoryAvailabilitySurfaceRead = {
	surface: InventoryAvailabilitySurface | null
	cacheState: "hit" | "miss"
}

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

function enumerateDates(from: string, toExclusive: string): string[] {
	const out: string[] = []
	let cursor = from
	while (cursor < toExclusive) {
		out.push(cursor)
		cursor = addDays(cursor, 1)
	}
	return out
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeOccupancyKey(occupancy: number): { occupancyInt: number; occupancyKey: string } {
	const occupancyInt = Math.max(1, Math.floor(occupancy))
	return {
		occupancyInt,
		occupancyKey: buildOccupancyKey({
			adults: occupancyInt,
			children: 0,
			infants: 0,
		}),
	}
}

async function loadInventoryAvailabilitySurface(params: {
	variantId: string
	from: string
	to: string
	occupancyInt: number
	occupancyKey: string
}): Promise<InventoryAvailabilitySurface | null> {
	const stayDates = enumerateDates(params.from, params.to)
	const rows = await db
		.select({
			ratePlanId: SearchUnitView.ratePlanId,
			date: SearchUnitView.date,
			isAvailable: SearchUnitView.isAvailable,
			hasAvailability: SearchUnitView.hasAvailability,
			hasPrice: SearchUnitView.hasPrice,
			availableUnits: SearchUnitView.availableUnits,
			pricePerNight: SearchUnitView.pricePerNight,
			minStay: SearchUnitView.minStay,
			maxStay: SearchUnitView.maxStay,
			minLeadTime: SearchUnitView.minLeadTime,
			maxLeadTime: SearchUnitView.maxLeadTime,
			cta: SearchUnitView.cta,
			ctd: SearchUnitView.ctd,
			primaryBlocker: SearchUnitView.primaryBlocker,
		})
		.from(SearchUnitView)
		.where(
			and(
				eq(SearchUnitView.variantId, params.variantId),
				eq(SearchUnitView.occupancyKey, params.occupancyKey),
				gte(SearchUnitView.date, params.from),
				lt(SearchUnitView.date, params.to)
			)
		)

	if (!rows.length) return null

	const byRatePlan = new Map<string, typeof rows>()
	for (const row of rows) {
		const key = String(row.ratePlanId ?? "")
		if (!key) continue
		const bucket = byRatePlan.get(key) ?? []
		bucket.push(row)
		byRatePlan.set(key, bucket)
	}
	if (!byRatePlan.size) return null

	let selected: InventoryAvailabilitySurface | null = null
	for (const [, bucket] of byRatePlan.entries()) {
		const byDate = new Map(
			bucket.map((row) => [
				String(row.date),
				{
					date: String(row.date),
					isAvailable: Boolean(row.isAvailable),
					hasAvailability: Boolean(row.hasAvailability),
					hasPrice: Boolean(row.hasPrice),
					availableUnits: Math.max(0, Number(row.availableUnits ?? 0)),
					minStay: row.minStay == null ? null : Number(row.minStay),
					maxStay: row.maxStay == null ? null : Number(row.maxStay),
					minLeadTime: row.minLeadTime == null ? null : Number(row.minLeadTime),
					maxLeadTime: row.maxLeadTime == null ? null : Number(row.maxLeadTime),
					cta: Boolean(row.cta),
					ctd: Boolean(row.ctd),
					primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
					pricePerNight:
						row.pricePerNight == null || !Number.isFinite(Number(row.pricePerNight))
							? null
							: Number(row.pricePerNight),
				},
			])
		)
		const evaluation = evaluateStaySellabilityFromView({
			stayDates,
			checkInDate: params.from,
			requestedRooms: params.occupancyInt,
			rowsByDate: byDate,
		})
		const days = stayDates.map((date) => {
			const row = byDate.get(date)
			const capacity = Math.max(0, Number(row?.availableUnits ?? 0))
			const closed =
				String(row?.primaryBlocker ?? "")
					.trim()
					.toUpperCase() === "STOP_SELL"
			const price = row?.pricePerNight ?? null
			let unsellableReason: string | null = null
			if (!row) unsellableReason = "UNKNOWN"
			else if (closed) unsellableReason = "CLOSED"
			else if (!row.hasAvailability) unsellableReason = "MISSING_AVAILABILITY"
			else if (capacity < params.occupancyInt) unsellableReason = "NO_CAPACITY"
			else if (!row.hasPrice || price == null) unsellableReason = "MISSING_PRICE"
			else if (!row.isAvailable || String(row.primaryBlocker ?? "").trim()) {
				unsellableReason = String(row.primaryBlocker ?? "UNKNOWN")
			}
			return {
				date,
				available: Boolean(row && row.isAvailable && capacity >= params.occupancyInt && !closed),
				capacity,
				price: price == null ? null : roundMoney(price),
				minStay: row?.minStay ?? null,
				closed,
				sellable: Boolean(
					row &&
					row.isAvailable &&
					row.hasAvailability &&
					row.hasPrice &&
					!String(row.primaryBlocker ?? "").trim() &&
					capacity >= params.occupancyInt
				),
				unsellableReason,
			}
		})
		const totalPrice = days.every((day) => day.price != null)
			? roundMoney(days.reduce((sum, day) => sum + Number(day.price ?? 0), 0))
			: null
		const candidate: InventoryAvailabilitySurface = {
			days,
			missingPricingDates: days.filter((day) => day.price == null).map((day) => day.date),
			summary: {
				sellable: evaluation.isSellable,
				totalPrice: evaluation.isSellable ? totalPrice : null,
				nights: stayDates.length,
				primaryBlocker:
					evaluation.reasonCodes.length > 0 ? String(evaluation.reasonCodes[0]) : null,
			},
		}

		if (!selected) selected = candidate
		else if (candidate.summary.sellable && !selected.summary.sellable) selected = candidate
		else if (
			candidate.summary.sellable &&
			selected.summary.sellable &&
			(candidate.summary.totalPrice ?? Infinity) < (selected.summary.totalPrice ?? Infinity)
		) {
			selected = candidate
		}
	}

	return selected
}

export async function getInventoryAvailabilitySurface(params: {
	variantId: string
	from: string
	to: string
	occupancy: number
}): Promise<InventoryAvailabilitySurfaceRead> {
	const { occupancyInt, occupancyKey } = normalizeOccupancyKey(params.occupancy)
	const key = cacheKeys.inventoryAvailabilitySurface(
		params.variantId,
		params.from,
		params.to,
		occupancyKey
	)
	const cached = await persistentCache.get(key)
	if (cached && typeof cached === "object") {
		return { surface: cached as InventoryAvailabilitySurface, cacheState: "hit" }
	}
	const surface = await loadInventoryAvailabilitySurface({
		variantId: params.variantId,
		from: params.from,
		to: params.to,
		occupancyInt,
		occupancyKey,
	})
	if (surface) {
		void persistentCache.set(key, surface, cacheTtls.inventoryAvailabilitySurface).catch(() => {})
	}
	return { surface, cacheState: "miss" }
}
