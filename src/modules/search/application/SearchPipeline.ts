import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"
import { toISODate } from "@/shared/domain/date/date.utils"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory, SellableUnit, InventorySnapshot } from "../domain/unit.types"
import type { RestrictionPort } from "./ports/RestrictionPort"
import type { PromotionPort } from "./ports/PromotionPort"
import type { TaxFeePort } from "./ports/TaxFeePort"
import type { TaxFeeBreakdown } from "@/modules/taxes-fees/domain/tax-fee.types"

export type SearchRatePlanOffer = {
	ratePlanId: string
	basePrice: number
	finalPrice: number
	taxesAndFees: TaxFeeBreakdown
	totalPrice: number
}

export interface ISearchContextLoader<TUnit extends SellableUnit = SellableUnit> {
	load(ctx: SearchContext<TUnit>): Promise<SearchMemory>
}

function calcNights(checkIn: Date, checkOut: Date): number {
	return Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000)
}

function normalizeInventoryDates(
	inventory: InventorySnapshot[]
): Array<InventorySnapshot & { date: string }> {
	return (
		inventory
			.map((d) => ({
				...d,
				date: typeof d.date === "string" ? d.date : toISODate(d.date),
			}))
			// Safety: after normalization we must have strings.
			.filter((d): d is InventorySnapshot & { date: string } => typeof d.date === "string")
	)
}

function isVariantAvailable(params: {
	grid: { date: string; availableRooms: number; stopSell: boolean }[]
	nights: number
	requestedQuantity: number
}): { ok: true } | { ok: false; reason: string } {
	if (params.nights <= 0) return { ok: false, reason: "invalid_stay" }
	if (!params.grid.length) return { ok: false, reason: "no_inventory" }

	// Full-stay strictness: if we don't have one row per night, treat as unavailable.
	if (params.grid.length !== params.nights) return { ok: false, reason: "incomplete_inventory" }

	if (params.grid.some((d) => d.stopSell)) return { ok: false, reason: "stop_sell" }

	if (params.grid.some((d) => d.availableRooms < params.requestedQuantity)) {
		return { ok: false, reason: "not_enough_inventory" }
	}

	return { ok: true }
}

export class SearchPipeline<TUnit extends SellableUnit = SellableUnit> {
	constructor(
		private loader: ISearchContextLoader<TUnit>,
		// private loader = new SearchContextLoader(globalRegistry),
		// private loader: { load(ctx: SearchContext): Promise<SearchMemory> },
		private availabilityEngine = new AvailabilityGridEngine(),
		private deps: {
			restrictions: RestrictionPort
			promotions: PromotionPort
			taxes: TaxFeePort
			effectivePricing: {
				getEffectiveTotalForRange(params: {
					variantId: string
					ratePlanId: string
					checkIn: Date
					checkOut: Date
				}): Promise<{ total: number | null; missingDates: string[] }>
			}
			coverage?: {
				ensureCoverage(params: {
					variantId: string
					ratePlanId: string
					checkIn: Date
					checkOut: Date
					missingDates: string[]
				}): Promise<void>
			}
		}
	) {
		if (!loader) {
			throw new Error("SearchPipeline requires loader")
		}
	}

	async run(ctx: SearchContext<TUnit>): Promise<SearchRatePlanOffer[]> {
		const memory: SearchMemory = await this.loader.load(ctx)

		/* 1️⃣ AVAILABILITY */

		const nights = calcNights(ctx.checkIn, ctx.checkOut)
		if (nights <= 0) return []

		// Quantity-aware availability. Keep API backward-compatible by defaulting to 1.
		const requestedQuantity = Number.isFinite(Number(ctx.rooms))
			? Math.max(1, Number(ctx.rooms))
			: 1

		// Normalize dates so full-stay checks are deterministic (no Date vs string leaks).
		const inventoryForGrid = normalizeInventoryDates(memory.inventory)

		const grid = this.availabilityEngine.buildGridFromMemory(
			inventoryForGrid,
			ctx.checkIn,
			ctx.checkOut
		)

		const availability = isVariantAvailable({ grid, nights, requestedQuantity })
		if (!availability.ok) return []

		/* 4️⃣ DEFAULT RATE PLAN ONLY + EFFECTIVE PRICING */
		const defaultRatePlan =
			memory.ratePlans.find((rp) => Boolean((rp as { isDefault?: unknown }).isDefault)) ??
			memory.ratePlans[0]
		if (!defaultRatePlan) return []
		const defaultRatePlanId = String((defaultRatePlan as { id?: unknown }).id ?? "").trim()
		if (!defaultRatePlanId) return []

		// Apply restrictions at product, variant, and rate-plan level.
		// The restriction engine itself is scope-agnostic, so the pipeline must filter by scopeId.
		const restrictions =
			memory.restrictions?.filter(
				(r) =>
					r.scopeId === defaultRatePlanId || r.scopeId === ctx.unitId || r.scopeId === ctx.productId
			) ?? []
		const restrictionResult = this.deps.restrictions.evaluateFromMemory({
			restrictions,
			checkIn: ctx.checkIn,
			checkOut: ctx.checkOut,
			nights,
		})
		if (!restrictionResult.allowed) return []

		const effective = await this.deps.effectivePricing.getEffectiveTotalForRange({
			variantId: ctx.unitId,
			ratePlanId: defaultRatePlanId,
			checkIn: ctx.checkIn,
			checkOut: ctx.checkOut,
		})
		if (effective.missingDates.length > 0 || effective.total === null) {
			console.warn("pricing_coverage_gap_detected", {
				variantId: ctx.unitId,
				ratePlanId: defaultRatePlanId,
				missingDatesCount: effective.missingDates.length,
				checkIn: toISODate(ctx.checkIn),
				checkOut: toISODate(ctx.checkOut),
			})
			if (this.deps.coverage?.ensureCoverage) {
				void this.deps.coverage
					.ensureCoverage({
						variantId: ctx.unitId,
						ratePlanId: defaultRatePlanId,
						checkIn: ctx.checkIn,
						checkOut: ctx.checkOut,
						missingDates: effective.missingDates,
					})
					.catch((error) => {
						console.warn("pricing_auto_heal_failed", {
							variantId: ctx.unitId,
							ratePlanId: defaultRatePlanId,
							message: error instanceof Error ? error.message : String(error),
						})
					})
			}
			for (const missingDate of effective.missingDates) {
				console.error("effective_pricing_missing_blocking", {
					variantId: ctx.unitId,
					date: missingDate,
					ratePlanId: defaultRatePlanId,
				})
			}
			return []
		}

		const final = this.deps.promotions.applyPromotions(
			Number(effective.total),
			memory.promotions ?? [],
			{
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
			}
		)
		const taxes = await this.deps.taxes.resolveEffectiveTaxFees({
			productId: ctx.productId,
			variantId: ctx.unitId,
			ratePlanId: defaultRatePlanId,
		})
		const taxBreakdown = this.deps.taxes.computeTaxBreakdown({
			base: final,
			definitions: taxes.definitions,
			nights,
			guests: ctx.adults + ctx.children,
		})

		return [
			{
				ratePlanId: defaultRatePlanId,
				basePrice: Number(effective.total),
				finalPrice: final,
				taxesAndFees: taxBreakdown,
				totalPrice: taxBreakdown.total,
			},
		]
	}
}
