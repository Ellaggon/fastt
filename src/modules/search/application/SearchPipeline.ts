import { toISODate } from "@/shared/domain/date/date.utils"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory, SellableUnit } from "../domain/unit.types"
import type { RestrictionPort } from "./ports/RestrictionPort"
import type { PromotionPort } from "./ports/PromotionPort"
import type { TaxFeePort } from "./ports/TaxFeePort"
import type { TaxFeeBreakdown } from "@/modules/taxes-fees/public"

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

function enumerateStayDates(checkIn: Date, checkOut: Date): string[] {
	const dates: string[] = []
	const cursor = new Date(checkIn)
	while (cursor < checkOut) {
		dates.push(toISODate(cursor))
		cursor.setDate(cursor.getDate() + 1)
	}
	return dates
}

export class SearchPipeline<TUnit extends SellableUnit = SellableUnit> {
	constructor(
		private loader: ISearchContextLoader<TUnit>,
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

		const stayDates = enumerateStayDates(ctx.checkIn, ctx.checkOut)
		const availabilityByDate = new Map(
			memory.inventory
				.map((day) => ({
					date: typeof day.date === "string" ? day.date : toISODate(day.date),
					availableUnits: Number(day.availableUnits ?? 0),
					isSellable: Boolean(day.isSellable),
					stopSell: Boolean(day.stopSell),
				}))
				.map((day) => [day.date, day] as const)
		)

		const missingAvailabilityDates = stayDates.filter((date) => !availabilityByDate.has(date))
		if (missingAvailabilityDates.length > 0) {
			console.warn("effective_availability_missing", {
				variantId: ctx.unitId,
				missingDatesCount: missingAvailabilityDates.length,
				checkIn: toISODate(ctx.checkIn),
				checkOut: toISODate(ctx.checkOut),
			})
			return []
		}

		const isAnyUnsellableDay = stayDates.some((date) => {
			const day = availabilityByDate.get(date)
			if (!day) return true
			if (!day.isSellable || day.stopSell) return true
			return day.availableUnits < requestedQuantity
		})
		if (isAnyUnsellableDay) return []

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
