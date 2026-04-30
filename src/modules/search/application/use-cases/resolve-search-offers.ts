import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import type { TaxFeeBreakdown } from "@/modules/taxes-fees/public"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"
import {
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
} from "../queries/evaluate-stay-from-view"
import type { SearchSellabilityDTO } from "../dto/SearchSellabilityDTO"
import type { SearchOffersRepositoryPort } from "../ports/SearchOffersRepository"
import { toISODate } from "@/shared/domain/date/date.utils"

export type SearchOffersInput = {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
	debug?: boolean
	currency?: string
}

export type SearchOffersResult = {
	offers: SearchOffer<SearchUnit>[]
	reason?: string
	sellabilityByRatePlan: Record<string, SearchSellabilityDTO>
	debugUnsellable?: Array<{
		variantId: string
		ratePlanId: string
		primaryBlocker: string
	}>
}

type ShadowV2Comparison = "match" | "mismatch_price" | "missing_v2"
type ShadowV2Cause =
	| "missing_v2_row"
	| "base_component_mismatch"
	| "occupancy_adjustment_mismatch"
	| "rule_adjustment_mismatch"

type ShadowV2Counters = {
	totalEvaluated: number
	matches: number
	mismatches: number
	missing: number
}

function inferShadowMismatchCause(input: {
	v2Row?: {
		baseComponent?: number
		occupancyAdjustment?: number
		ruleAdjustment?: number
	}
}): ShadowV2Cause {
	if (!input.v2Row) return "missing_v2_row"
	const ruleAdjustment = Number(input.v2Row.ruleAdjustment ?? 0)
	const occupancyAdjustment = Number(input.v2Row.occupancyAdjustment ?? 0)
	if (Math.abs(ruleAdjustment) > 0.000001) return "rule_adjustment_mismatch"
	if (Math.abs(occupancyAdjustment) > 0.000001) return "occupancy_adjustment_mismatch"
	return "base_component_mismatch"
}

function toDateOnly(value: Date): string {
	return toISODate(value)
}

function enumerateStayDates(checkIn: Date, checkOut: Date): string[] {
	const dates: string[] = []
	const cursor = new Date(
		Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())
	)
	const end = new Date(
		Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate())
	)
	while (cursor < end) {
		dates.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return dates
}

export async function resolveSearchOffers(
	params: SearchOffersInput,
	deps: { repo: SearchOffersRepositoryPort }
): Promise<SearchOffersResult> {
	const units = await deps.repo.listActiveUnitsByProduct(params.productId)
	if (!units.length) return { offers: [], reason: "no_active_units", sellabilityByRatePlan: {} }
	logger.debug("search.view.trace.active_units", {
		productId: params.productId,
		variants: units.map((unit) => ({
			variantId: unit.id,
			kind: unit.kind,
			minOccupancy: unit.capacity?.minOccupancy ?? null,
			maxOccupancy: unit.capacity?.maxOccupancy ?? null,
		})),
	})

	const stayDates = enumerateStayDates(params.checkIn, params.checkOut)
	if (!stayDates.length)
		return { offers: [], reason: "invalid_stay_range", sellabilityByRatePlan: {} }
	logger.debug("search.view.trace.stay_dates", {
		productId: params.productId,
		checkIn: toDateOnly(params.checkIn),
		checkOut: toDateOnly(params.checkOut),
		nights: stayDates.length,
		stayDates,
	})

	const requestedRooms = Math.max(1, Number(params.rooms ?? 1))
	const occupancyKey = buildOccupancyKey({
		adults: params.adults,
		children: params.children,
		infants: 0,
	})

	const unitIds = units.map((unit) => unit.id).filter(Boolean)
	if (!unitIds.length) return { offers: [], reason: "no_active_units", sellabilityByRatePlan: {} }
	const from = toDateOnly(params.checkIn)
	const to = toDateOnly(params.checkOut)
	const loadRowsAndV2 = async () => {
		const rows = await deps.repo.listSearchUnitViewRows({
			unitIds,
			from,
			to,
			occupancyKey,
		})
		const ratePlanIds = Array.from(
			new Set(rows.map((row) => String(row.ratePlanId)).filter((id) => id.length > 0))
		)
		const v2Rows = deps.repo.listEffectivePricingV2Rows
			? await deps.repo.listEffectivePricingV2Rows({
					unitIds,
					ratePlanIds,
					from,
					to,
					occupancyKey,
				})
			: []
		return { rows, v2Rows }
	}
	const { rows, v2Rows } = await loadRowsAndV2()
	const v2ByKey = new Map<
		string,
		{
			finalBasePrice: number
			baseComponent?: number
			occupancyAdjustment?: number
			ruleAdjustment?: number
		}
	>()
	for (const row of v2Rows) {
		v2ByKey.set(`${row.variantId}:${row.ratePlanId}:${row.date}`, {
			finalBasePrice: Number(row.finalBasePrice),
			baseComponent: row.baseComponent,
			occupancyAdjustment: row.occupancyAdjustment,
			ruleAdjustment: row.ruleAdjustment,
		})
	}
	const shadowCounters: ShadowV2Counters = {
		totalEvaluated: 0,
		matches: 0,
		mismatches: 0,
		missing: 0,
	}
	logger.debug("search.view.trace.rows", {
		productId: params.productId,
		occupancyKey,
		rowCount: rows.length,
		rows: rows.map((row) => ({
			variantId: String(row.variantId),
			ratePlanId: String(row.ratePlanId),
			date: String(row.date),
			isSellable: Boolean(row.isSellable),
			isAvailable: Boolean(row.isAvailable),
			availableUnits: Number(row.availableUnits ?? 0),
			hasPrice: Boolean(row.hasPrice),
			pricePerNight:
				row.pricePerNight == null || !Number.isFinite(Number(row.pricePerNight))
					? null
					: Number(row.pricePerNight),
			primaryBlocker: row.primaryBlocker == null ? null : String(row.primaryBlocker),
		})),
	})
	if (!rows.length) {
		return {
			offers: [],
			reason: "missing_view_data",
			sellabilityByRatePlan: {},
		}
	}

	const byVariantRatePlan = new Map<string, typeof rows>()
	for (const row of rows) {
		const key = `${String(row.variantId)}:${String(row.ratePlanId)}`
		const bucket = byVariantRatePlan.get(key) ?? []
		bucket.push(row)
		byVariantRatePlan.set(key, bucket)
	}

	const offers: SearchOffer<SearchUnit>[] = []
	let sawMissingViewData = false
	let sawInconsistentViewData = false
	let sawMissingViewPrice = false
	const sellabilityByRatePlan: Record<string, SearchSellabilityDTO> = {}
	const debugUnsellable: Array<{
		variantId: string
		ratePlanId: string
		primaryBlocker: string
	}> = []
	const checkInDate = toDateOnly(params.checkIn)
	for (const unit of units) {
		const ratePlanOffers: SearchOffer<SearchUnit>["ratePlans"] = []
		for (const [key, bucket] of byVariantRatePlan.entries()) {
			if (!key.startsWith(`${unit.id}:`)) continue

			const bucketByDate = new Map<string, SearchUnitViewStayRow>(
				bucket.map((row) => [
					String(row.date),
					{
						date: String(row.date),
						isSellable: Boolean(row.isSellable),
						isAvailable: Boolean(row.isAvailable),
						hasAvailability: Boolean(row.hasAvailability),
						hasPrice: Boolean(row.hasPrice),
						stopSell: Boolean(row.stopSell),
						availableUnits: Math.max(0, Number(row.availableUnits ?? 0)),
						minStay: row.minStay == null ? null : Number(row.minStay),
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
			const ratePlanId = String(bucket[0]?.ratePlanId ?? "")
			if (!ratePlanId) continue

			const stayDayRows = stayDates
				.map((date) => bucketByDate.get(date))
				.filter((row): row is NonNullable<typeof row> => row != null)

			if (stayDayRows.length !== stayDates.length) {
				sawMissingViewData = true
				if (params.debug) {
					debugUnsellable.push({
						variantId: unit.id,
						ratePlanId,
						primaryBlocker: "UNKNOWN",
					})
				}
				continue
			}

			for (const day of stayDayRows) {
				const compareKey = `${unit.id}:${ratePlanId}:${day.date}`
				const v2Value = v2ByKey.get(compareKey)
				const v2Price = v2Value?.finalBasePrice
				const projectedPrice = Number(day.pricePerNight ?? NaN)
				const hasV2Price = v2Price != null && Number.isFinite(Number(v2Price))
				if (hasV2Price) {
					day.pricePerNight = Number(v2Price)
				} else {
					day.pricePerNight = null
				}
				if (!Number.isFinite(projectedPrice)) continue
				shadowCounters.totalEvaluated += 1
				let comparison: ShadowV2Comparison = "match"
				if (v2Price == null || !Number.isFinite(Number(v2Price))) {
					comparison = "missing_v2"
					shadowCounters.missing += 1
				} else if (Number(v2Price) !== Number(projectedPrice)) {
					comparison = "mismatch_price"
					shadowCounters.mismatches += 1
				} else {
					shadowCounters.matches += 1
				}
				const dateBucket = String(day.date).slice(0, 10)
				const baseTags = {
					endpoint: "searchOffers",
					productId: params.productId,
					ratePlanId,
					occupancyKey,
					date: dateBucket,
				}
				incrementCounter("search_v2_shadow_total", baseTags, 1)
				if (comparison === "match") {
					incrementCounter("search_v2_shadow_match_total", baseTags, 1)
				} else if (comparison === "missing_v2") {
					incrementCounter("search_v2_shadow_missing_total", baseTags, 1)
					incrementCounter(
						"search_v2_shadow_mismatch_cause_total",
						{
							...baseTags,
							cause: "missing_v2_row",
						},
						1
					)
				} else {
					incrementCounter("search_v2_shadow_mismatch_total", baseTags, 1)
					const cause = inferShadowMismatchCause({ v2Row: v2Value })
					incrementCounter(
						"search_v2_shadow_mismatch_cause_total",
						{
							...baseTags,
							cause,
						},
						1
					)
				}
				if (params.debug && comparison !== "match") {
					const probableCause = inferShadowMismatchCause({ v2Row: v2Value })
					logger.debug("search.pricing.v2_shadow.compare", {
						variantId: unit.id,
						ratePlanId,
						date: day.date,
						occupancyKey,
						projectedPrice,
						v2Price: v2Price ?? null,
						comparison,
						probableCause,
					})
				}
			}

			const checkInRow = bucketByDate.get(checkInDate)
			if (!checkInRow) {
				sawMissingViewData = true
				if (params.debug) {
					debugUnsellable.push({
						variantId: unit.id,
						ratePlanId,
						primaryBlocker: "UNKNOWN",
					})
				}
				continue
			}

			for (const day of stayDayRows) {
				if (Boolean(day.isSellable) && String(day.primaryBlocker ?? "").trim().length > 0) {
					sawInconsistentViewData = true
				}
			}

			const evaluation = evaluateStaySellabilityFromView({
				stayDates,
				checkInDate,
				requestedRooms,
				rowsByDate: bucketByDate,
				currency: params.currency,
			})
			const ratePlanDecisionKey = `${unit.id}:${ratePlanId}`
			sellabilityByRatePlan[ratePlanDecisionKey] = evaluation
			const unsellableBlocker = evaluation.isSellable
				? null
				: String(evaluation.reasonCodes[0] ?? "UNKNOWN")

			if (unsellableBlocker) {
				if (params.debug) {
					debugUnsellable.push({
						variantId: unit.id,
						ratePlanId,
						primaryBlocker: unsellableBlocker,
					})
				}
				continue
			}

			const hasMissingPrices = stayDates.some((date) => {
				const day = bucketByDate.get(date)
				return (
					day == null || day.pricePerNight == null || !Number.isFinite(Number(day.pricePerNight))
				)
			})
			if (hasMissingPrices) {
				sawMissingViewPrice = true
				continue
			}

			const total = stayDates.reduce((sum, date) => {
				const day = bucketByDate.get(date)
				return sum + Number(day?.pricePerNight ?? 0)
			}, 0)

			ratePlanOffers.push({
				ratePlanId,
				basePrice: total,
				finalPrice: total,
				taxesAndFees: {
					total,
					base: total,
					taxes: { included: [], excluded: [] },
					fees: { included: [], excluded: [] },
					currency: "USD",
				} as TaxFeeBreakdown,
				totalPrice: total,
			})
		}

		if (ratePlanOffers.length > 0) {
			offers.push({
				variantId: unit.id,
				variant: unit,
				ratePlans: ratePlanOffers,
			})
		}
	}

	if (shadowCounters.totalEvaluated > 0) {
		const mismatchRatio = shadowCounters.mismatches / shadowCounters.totalEvaluated
		const missingRatio = shadowCounters.missing / shadowCounters.totalEvaluated
		if (mismatchRatio > 0.05 || missingRatio > 0.05) {
			logger.warn("search.pricing.v2_shadow.summary", {
				productId: params.productId,
				occupancyKey,
				...shadowCounters,
				mismatchRatio,
				missingRatio,
			})
		} else if (params.debug) {
			logger.debug("search.pricing.v2_shadow.summary", {
				productId: params.productId,
				occupancyKey,
				...shadowCounters,
				mismatchRatio,
				missingRatio,
			})
		}
	}

	if (!offers.length) {
		if (sawInconsistentViewData) {
			return {
				offers,
				reason: "inconsistent_view_data",
				sellabilityByRatePlan,
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
		if (sawMissingViewData) {
			return {
				offers,
				reason: "missing_view_data",
				sellabilityByRatePlan,
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
		if (sawMissingViewPrice) {
			return {
				offers,
				reason: "missing_view_price",
				sellabilityByRatePlan,
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
	}

	return {
		offers,
		sellabilityByRatePlan,
		debugUnsellable: params.debug ? debugUnsellable : undefined,
	}
}

export const resolveSearchOffersFromView = resolveSearchOffers
