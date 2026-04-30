import type { APIRoute } from "astro"
import { and, db, eq, gte, lt, SearchUnitView } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { buildOccupancyKey, evaluateStaySellabilityFromView } from "@/modules/search/public"

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

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "availability-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variantId = String(url.searchParams.get("variantId") ?? "").trim()
		const from = String(url.searchParams.get("from") ?? "").trim()
		const to = String(url.searchParams.get("to") ?? "").trim()
		const occupancy = Number(url.searchParams.get("occupancy") ?? 1)

		if (!variantId || !from || !to || !Number.isFinite(occupancy) || occupancy <= 0 || to <= from) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const occupancyInt = Math.max(1, Math.floor(occupancy))
		const occupancyKey = buildOccupancyKey({
			adults: occupancyInt,
			children: 0,
			infants: 0,
		})
		const stayDates = enumerateDates(from, to)
		const rows = await db
			.select({
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
					eq(SearchUnitView.variantId, variantId),
					eq(SearchUnitView.occupancyKey, occupancyKey),
					gte(SearchUnitView.date, from),
					lt(SearchUnitView.date, to)
				)
			)
			.all()

		if (!rows.length) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const byRatePlan = new Map<string, typeof rows>()
		for (const row of rows) {
			const key = String(row.ratePlanId ?? "")
			if (!key) continue
			const bucket = byRatePlan.get(key) ?? []
			bucket.push(row)
			byRatePlan.set(key, bucket)
		}
		if (!byRatePlan.size) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		let selected:
			| {
					ratePlanId: string
					days: Array<{
						date: string
						available: boolean
						capacity: number
						price: number | null
						minStay: number | null
						closed: boolean
						sellable: boolean
						unsellableReason: string | null
					}>
					summary: {
						sellable: boolean
						totalPrice: number | null
						nights: number
						primaryBlocker: string | null
					}
					missingPricingDates: string[]
			  }
			| undefined
		for (const [ratePlanId, bucket] of byRatePlan.entries()) {
			const byDate = new Map(
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
			const evaluation = evaluateStaySellabilityFromView({
				stayDates,
				checkInDate: from,
				requestedRooms: occupancyInt,
				rowsByDate: byDate,
			})
			const days = stayDates.map((date) => {
				const row = byDate.get(date)
				const capacity = Math.max(0, Number(row?.availableUnits ?? 0))
				const closed = Boolean(row?.stopSell ?? false)
				const price = row?.pricePerNight ?? null
				let unsellableReason: string | null = null
				if (!row) unsellableReason = "UNKNOWN"
				else if (closed) unsellableReason = "CLOSED"
				else if (!row.hasAvailability) unsellableReason = "MISSING_AVAILABILITY"
				else if (capacity < occupancyInt) unsellableReason = "NO_CAPACITY"
				else if (!row.hasPrice || price == null) unsellableReason = "MISSING_PRICE"
				else if (!row.isSellable || !row.isAvailable)
					unsellableReason = String(row.primaryBlocker ?? "UNKNOWN")
				return {
					date,
					available: Boolean(row && row.isAvailable && capacity >= occupancyInt && !closed),
					capacity,
					price: price == null ? null : roundMoney(price),
					minStay: row?.minStay ?? null,
					closed,
					sellable: Boolean(row?.isSellable ?? false),
					unsellableReason,
				}
			})
			const totalPrice = days.every((day) => day.price != null)
				? roundMoney(days.reduce((sum, day) => sum + Number(day.price ?? 0), 0))
				: null
			const candidate = {
				ratePlanId,
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

			if (!selected) {
				selected = candidate
				continue
			}
			if (candidate.summary.sellable && !selected.summary.sellable) {
				selected = candidate
				continue
			}
			if (
				candidate.summary.sellable &&
				selected.summary.sellable &&
				(candidate.summary.totalPrice ?? Infinity) < (selected.summary.totalPrice ?? Infinity)
			) {
				selected = candidate
			}
		}

		if (!selected) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		logEndpoint()
		return new Response(
			JSON.stringify({
				days: selected.days,
				missingPricingDates: selected.missingPricingDates,
				summary: selected.summary,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		logEndpoint()
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
}
