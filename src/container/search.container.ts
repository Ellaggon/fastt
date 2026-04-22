import { and, db, eq, gte, inArray, lt, SearchUnitView } from "astro:db"

import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import { variantRepository } from "./pricing.container"
import { logger } from "@/lib/observability/logger"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"
import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"
import { isUnitType } from "@/modules/search/domain/unit.types"
import {
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
} from "@/modules/search/application/queries/evaluate-stay-from-view"
import type { TaxFeeBreakdown } from "@/modules/taxes-fees/domain/tax-fee.types"
import { toISODate } from "@/shared/domain/date/date.utils"

const autoBackfillInFlight = new Set<string>()

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

async function getActiveUnitsByProduct(productId: string): Promise<SearchUnit[]> {
	const rows = await variantRepository.getActiveByProduct(productId)
	return rows
		.map((v) => ({
			id: v.id,
			productId: v.productId,
			kind: v.kind,
			pricing: v.pricing,
			capacity: v.capacity,
		}))
		.filter((unit) => isUnitType(unit.kind))
}

function enqueueAutoBackfill(params: {
	productId: string
	from: string
	to: string
	reason: string
}): void {
	if (process.env.SEARCH_VIEW_AUTO_BACKFILL === "false") return
	const key = `${params.productId}:${params.from}:${params.to}`
	if (autoBackfillInFlight.has(key)) return
	autoBackfillInFlight.add(key)

	queueMicrotask(async () => {
		try {
			const units = await getActiveUnitsByProduct(params.productId)
			const { materializeSearchUnitRange } = await import("@/modules/search/public")
			let rows = 0
			for (const unit of units) {
				const result = await materializeSearchUnitRange({
					variantId: unit.id,
					from: params.from,
					to: params.to,
					currency: "USD",
				})
				rows += Number(result.rows ?? 0)
			}
			incrementCounter("search_view_autobackfill_success_total", {
				endpoint: "searchOffers",
				reason: params.reason,
			})
			logger.info("search.view.autobackfill.completed", {
				productId: params.productId,
				from: params.from,
				to: params.to,
				reason: params.reason,
				variantCount: units.length,
				rows,
			})
		} catch (error) {
			incrementCounter("search_view_autobackfill_error_total", {
				endpoint: "searchOffers",
				reason: params.reason,
			})
			logger.warn("search.view.autobackfill.failed", {
				productId: params.productId,
				from: params.from,
				to: params.to,
				reason: params.reason,
				message: error instanceof Error ? error.message : String(error),
			})
		} finally {
			autoBackfillInFlight.delete(key)
		}
	})
}

async function searchOffersFromView(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
	debug?: boolean
}): Promise<{
	offers: SearchOffer<SearchUnit>[]
	reason?: string
	debugUnsellable?: Array<{
		variantId: string
		ratePlanId: string
		primaryBlocker: string
	}>
}> {
	const units = await getActiveUnitsByProduct(params.productId)
	if (!units.length) return { offers: [], reason: "no_active_units" }
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
	if (!stayDates.length) return { offers: [], reason: "invalid_stay_range" }
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
	if (!unitIds.length) return { offers: [], reason: "no_active_units" }

	const rows = await db
		.select({
			variantId: SearchUnitView.variantId,
			ratePlanId: SearchUnitView.ratePlanId,
			date: SearchUnitView.date,
			isSellable: SearchUnitView.isSellable,
			isAvailable: SearchUnitView.isAvailable,
			hasAvailability: SearchUnitView.hasAvailability,
			hasPrice: SearchUnitView.hasPrice,
			stopSell: SearchUnitView.stopSell,
			availableUnits: SearchUnitView.availableUnits,
			pricePerNight: SearchUnitView.pricePerNight,
			minStay: SearchUnitView.minStay,
			cta: SearchUnitView.cta,
			ctd: SearchUnitView.ctd,
			primaryBlocker: SearchUnitView.primaryBlocker,
		})
		.from(SearchUnitView)
		.where(
			and(
				eq(SearchUnitView.productId, params.productId),
				inArray(SearchUnitView.variantId, unitIds),
				gte(SearchUnitView.date, toDateOnly(params.checkIn)),
				lt(SearchUnitView.date, toDateOnly(params.checkOut)),
				eq(SearchUnitView.occupancyKey, occupancyKey)
			)
		)
		.all()
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
			})
			const unsellableBlocker = evaluation.sellable
				? null
				: (evaluation.primaryBlocker ?? "UNKNOWN")

			if (unsellableBlocker) {
				if (params.debug) {
					logger.info("search.view.unsellable_decision", {
						productId: params.productId,
						variantId: unit.id,
						ratePlanId,
						checkIn: checkInDate,
						checkOut: toDateOnly(params.checkOut),
						stayDates,
						primaryBlocker: unsellableBlocker,
						evaluationFailingDate: evaluation.failingDate ?? null,
						perNight: stayDates.map((date) => {
							const day = bucketByDate.get(date)
							return {
								date,
								isSellable: day?.isSellable ?? null,
								isAvailable: day?.isAvailable ?? null,
								hasAvailability: day?.hasAvailability ?? null,
								hasPrice: day?.hasPrice ?? null,
								stopSell: day?.stopSell ?? null,
								availableUnits: day?.availableUnits ?? null,
								minStay: day?.minStay ?? null,
								cta: day?.cta ?? null,
								ctd: day?.ctd ?? null,
								pricePerNight: day?.pricePerNight ?? null,
								primaryBlocker: day?.primaryBlocker ?? null,
							}
						}),
					})
				}
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
			logger.debug("search.view.trace.price_aggregation", {
				productId: params.productId,
				variantId: unit.id,
				ratePlanId,
				nights: stayDates.length,
				priceInputs: stayDates.map((date) => ({
					date,
					pricePerNight: Number(bucketByDate.get(date)?.pricePerNight ?? 0),
				})),
				total,
			})

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
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
		if (sawMissingViewData) {
			return {
				offers,
				reason: "missing_view_data",
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
		if (sawMissingViewPrice) {
			return {
				offers,
				reason: "missing_view_price",
				debugUnsellable: params.debug ? debugUnsellable : undefined,
			}
		}
	}

	return { offers, debugUnsellable: params.debug ? debugUnsellable : undefined }
}

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
	debug?: boolean
}): Promise<SearchOffer<SearchUnit>[]> {
	const startedAt = Date.now()
	const endpoint = "searchOffers"
	incrementCounter("search_view_requests_total", { endpoint })

	try {
		const result = await searchOffersFromView(params)
		const durationMs = Date.now() - startedAt
		observeTiming("search_latency_ms", durationMs, { endpoint, engine: "view" })
		incrementCounter("search_view_success_total", { endpoint })

		if (result.reason) {
			incrementCounter("search_view_empty_reason_total", { endpoint, reason: result.reason })
			if (result.reason !== "no_active_units" && result.reason !== "invalid_stay_range") {
				incrementCounter("search_view_anomalous_empty_total", { endpoint, reason: result.reason })
				enqueueAutoBackfill({
					productId: params.productId,
					from: toDateOnly(params.checkIn),
					to: toDateOnly(new Date(params.checkOut.getTime() + 86_400_000)),
					reason: result.reason,
				})
			}
			logger.warn("search.view.empty", {
				endpoint,
				productId: params.productId,
				reason: result.reason,
				durationMs,
			})
		} else {
			logger.info("search.view.request", {
				endpoint,
				productId: params.productId,
				offersCount: result.offers.length,
				debugUnsellableCount: result.debugUnsellable?.length ?? undefined,
				durationMs,
			})
			if (params.debug && result.debugUnsellable && result.debugUnsellable.length > 0) {
				logger.info("search.view.unsellable", {
					endpoint,
					productId: params.productId,
					items: result.debugUnsellable,
				})
			}
		}

		return result.offers
	} catch (error) {
		const durationMs = Date.now() - startedAt
		incrementCounter("search_view_error_total", { endpoint })
		observeTiming("search_latency_ms", durationMs, { endpoint, engine: "view_error" })
		logger.error("search.view.error", {
			endpoint,
			productId: params.productId,
			message: error instanceof Error ? error.message : String(error),
			durationMs,
		})
		return []
	}
}

export async function searchOffersDebug(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
}): Promise<{
	offers: SearchOffer<SearchUnit>[]
	unsellable: Array<{
		variantId: string
		ratePlanId: string
		primaryBlocker: string
	}>
}> {
	const result = await searchOffersFromView({ ...params, debug: true })
	return {
		offers: result.offers,
		unsellable: result.debugUnsellable ?? [],
	}
}
