import { hasCanonicalPriceQuoteIdentity, type PriceQuote } from "@/modules/pricing/public"

export const HOLD_COMMERCIAL_SNAPSHOT_VERSION = "hold_commercial_snapshot_v1" as const

export type HoldCommercialSnapshot = {
	version: typeof HOLD_COMMERCIAL_SNAPSHOT_VERSION
	ratePlanId: string
	currency: string
	rooms: number
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
	priceQuote: PriceQuote
}

function finiteMoney(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * Commercial evidence bound to a physical hold. This deliberately includes the
 * whole guest-facing quote so checkout never needs a cache or a price recompute.
 */
export function isHoldCommercialSnapshot(value: unknown): value is HoldCommercialSnapshot {
	if (!value || typeof value !== "object") return false
	const snapshot = value as HoldCommercialSnapshot
	if (
		snapshot.version !== HOLD_COMMERCIAL_SNAPSHOT_VERSION ||
		!hasCanonicalPriceQuoteIdentity(snapshot.priceQuote) ||
		typeof snapshot.ratePlanId !== "string" ||
		!snapshot.ratePlanId ||
		typeof snapshot.currency !== "string" ||
		!snapshot.currency ||
		!Number.isInteger(snapshot.rooms) ||
		snapshot.rooms < 1 ||
		typeof snapshot.from !== "string" ||
		!snapshot.from ||
		typeof snapshot.to !== "string" ||
		!snapshot.to ||
		!Number.isInteger(snapshot.nights) ||
		snapshot.nights < 1 ||
		!finiteMoney(snapshot.totalPrice) ||
		!Array.isArray(snapshot.days) ||
		snapshot.days.length === 0
	) {
		return false
	}

	const occupancy = snapshot.occupancyDetail
	if (
		!occupancy ||
		!Number.isInteger(snapshot.occupancy) ||
		snapshot.occupancy !== occupancy.adults + occupancy.children ||
		!Number.isInteger(occupancy.adults) ||
		occupancy.adults < 1 ||
		!Number.isInteger(occupancy.children) ||
		occupancy.children < 0 ||
		!Number.isInteger(occupancy.infants) ||
		occupancy.infants < 0
	) {
		return false
	}
	if (
		snapshot.priceQuote.context.ratePlanId !== snapshot.ratePlanId ||
		snapshot.priceQuote.context.checkIn !== snapshot.from ||
		snapshot.priceQuote.context.checkOut !== snapshot.to ||
		snapshot.priceQuote.context.rooms !== snapshot.rooms ||
		snapshot.priceQuote.currency !== snapshot.currency ||
		Number(snapshot.priceQuote.totalAmount.toFixed(2)) !== Number(snapshot.totalPrice.toFixed(2)) ||
		snapshot.priceQuote.context.occupancy.adults !== occupancy.adults ||
		snapshot.priceQuote.context.occupancy.children !== occupancy.children ||
		snapshot.priceQuote.context.occupancy.infants !== occupancy.infants
	) {
		return false
	}
	if (
		snapshot.nights !== snapshot.days.length ||
		snapshot.days.length !== snapshot.priceQuote.pricing.days.length ||
		!snapshot.days.every(
			(day) =>
				Boolean(day) && typeof day.date === "string" && Boolean(day.date) && finiteMoney(day.price)
		)
	) {
		return false
	}
	const quoteDays = new Map(
		snapshot.priceQuote.pricing.days.map((day) => [day.date, Number(day.price.toFixed(2))])
	)
	if (new Set(snapshot.days.map((day) => day.date)).size !== quoteDays.size) return false
	return snapshot.days.every((day) => quoteDays.get(day.date) === Number(day.price.toFixed(2)))
}
