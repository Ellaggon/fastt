import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import type { TaxFeeBreakdown } from "@/modules/taxes-fees/public"
import { logger } from "@/lib/observability/logger"
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

function toDateOnly(value: Date): string {
	return toISODate(value)
}

function enumerateStayDates(checkIn: Date, checkOut: Date): string[] {
	const dates: string[] = []
	const cursor = new Date(checkIn)
	while (cursor < checkOut) {
		dates.push(toDateOnly(cursor))
		cursor.setDate(cursor.getDate() + 1)
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

	const occupancy = Math.max(1, Number(params.adults ?? 0) + Number(params.children ?? 0))
	const requestedRooms = Math.max(1, Number(params.rooms ?? 1))
	const occupancyKey = buildOccupancyKey({
		rooms: 1,
		adults: params.adults,
		children: params.children,
		totalGuests: occupancy,
	})

	const unitIds = units.map((unit) => unit.id).filter(Boolean)
	if (!unitIds.length) return { offers: [], reason: "no_active_units", sellabilityByRatePlan: {} }

	const rows = await deps.repo.listSearchUnitViewRows({
		unitIds,
		from: toDateOnly(params.checkIn),
		to: toDateOnly(params.checkOut),
		occupancyKey,
	})
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
