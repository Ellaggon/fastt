import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"
import { toISODate } from "@/shared/domain/date/date.utils"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory, SellableUnit, InventorySnapshot } from "../domain/unit.types"
import type { PricingPort } from "./ports/PricingPort"
import type { RestrictionPort } from "./ports/RestrictionPort"
import type { PromotionPort } from "./ports/PromotionPort"

export type SearchRatePlanOffer = {
	ratePlanId: string
	basePrice: number
	finalPrice: number
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
			pricing: PricingPort
			promotions: PromotionPort
		}
	) {
		if (!loader) {
			throw new Error("SearchPipeline requires loader")
		}
	}

	async run(ctx: SearchContext<TUnit>): Promise<SearchRatePlanOffer[]> {
		const memory: SearchMemory = await this.loader.load(ctx)
		console.log("MEMORY", memory)

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

		/* 4️⃣ RATE PLANS LOOP */

		const validPlans: SearchRatePlanOffer[] = []

		for (const rp of memory.ratePlans) {
			/* Restricciones por rate plan */

			// Apply restrictions at product, variant, and rate-plan level.
			// The restriction engine itself is scope-agnostic, so the pipeline must filter by scopeId.
			const restrictions =
				memory.restrictions?.filter(
					(r) => r.scopeId === rp.id || r.scopeId === ctx.unitId || r.scopeId === ctx.productId
				) ?? []

			const restrictionResult = this.deps.restrictions.evaluateFromMemory({
				restrictions,
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
				nights,
			})

			if (!restrictionResult.allowed) continue

			/* Pricing con rule */

			const priceRules =
				memory.priceRules?.filter((r) => r.ratePlanId === rp.id && r.isActive) ?? []

			let computedTotal: number
			try {
				computedTotal = this.deps.pricing.computeStayBasePriceWithRulesStrict({
					basePricePerNight: ctx.basePrice,
					nights,
					priceRules,
				})
			} catch {
				// Strict rule model: invalid rule types/values make the plan non-applicable.
				continue
			}

			/* Promotions */

			const final = this.deps.promotions.applyPromotions(computedTotal, memory.promotions ?? [], {
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
			})

			validPlans.push({
				ratePlanId: rp.id,
				basePrice: computedTotal,
				finalPrice: final,
			})
		}

		return validPlans
	}
}
