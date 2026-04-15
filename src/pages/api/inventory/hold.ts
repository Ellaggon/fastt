import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { and, db, eq, gte, lt, SearchUnitView } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { applyInventoryMutation, createInventoryHold } from "@/modules/inventory/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"
import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"
import {
	evaluateStaySellabilityFromView,
	type SearchUnitViewStayRow,
} from "@/modules/search/application/queries/evaluate-stay-from-view"
import { toISODate } from "@/shared/domain/date/date.utils"

const schema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	occupancy: z.number().int().min(1),
	sessionId: z.string().min(1).optional(),
})

function optionalTrimmed(value: unknown): string | undefined {
	const s = String(value ?? "").trim()
	return s.length > 0 ? s : undefined
}

function enumerateStayDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	while (cursor < end) {
		out.push(toISODate(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

type HoldabilityResult =
	| {
			holdable: true
			ratePlanId: string
			totalPrice: number
			nights: number
			days: Array<{ date: string; price: number }>
	  }
	| {
			holdable: false
			reason: string
			failingDate: string | null
			debug: {
				variantId: string
				checkIn: string
				checkOut: string
				occupancyKey: string
			}
	  }

async function resolveHoldabilityFromView(params: {
	productId: string
	variantId: string
	checkIn: string
	checkOut: string
	occupancy: number
	requestedRooms: number
}): Promise<HoldabilityResult> {
	const stayDates = enumerateStayDates(params.checkIn, params.checkOut)
	if (!stayDates.length) {
		return {
			holdable: false,
			reason: "INVALID_STAY_RANGE",
			failingDate: null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey: "",
			},
		}
	}

	const occupancyKey = buildOccupancyKey({
		rooms: 1,
		adults: params.occupancy,
		children: 0,
		totalGuests: params.occupancy,
	})
	const checkOutDate = params.checkOut
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
				eq(SearchUnitView.productId, params.productId),
				eq(SearchUnitView.variantId, params.variantId),
				eq(SearchUnitView.occupancyKey, occupancyKey),
				gte(SearchUnitView.date, params.checkIn),
				lt(SearchUnitView.date, addDays(checkOutDate, 1))
			)
		)
		.all()

	if (!rows.length) {
		return {
			holdable: false,
			reason: "UNKNOWN",
			failingDate: stayDates[0] ?? null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey,
			},
		}
	}

	const byRatePlan = new Map<string, typeof rows>()
	for (const row of rows) {
		const key = String(row.ratePlanId ?? "")
		if (!key) continue
		const bucket = byRatePlan.get(key) ?? []
		bucket.push(row)
		byRatePlan.set(key, bucket)
	}

	let firstFailure: { reason: string; failingDate: string | null } | null = null
	let selected: {
		ratePlanId: string
		totalPrice: number
		days: Array<{ date: string; price: number }>
	} | null = null
	for (const [ratePlanId, bucket] of byRatePlan.entries()) {
		const byDate = new Map<string, SearchUnitViewStayRow>(
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
			checkInDate: params.checkIn,
			checkOutDate,
			requestedRooms: params.requestedRooms,
			rowsByDate: byDate,
		})
		if (!evaluation.sellable) {
			if (!firstFailure) {
				firstFailure = {
					reason: String(evaluation.primaryBlocker ?? "UNKNOWN"),
					failingDate: evaluation.failingDate ?? null,
				}
			}
			continue
		}

		const days = stayDates.map((date) => {
			const row = byDate.get(date)
			return {
				date,
				price: row?.pricePerNight ?? 0,
			}
		})
		if (days.some((day) => !Number.isFinite(day.price) || day.price <= 0)) {
			if (!firstFailure) {
				firstFailure = {
					reason: "MISSING_PRICE",
					failingDate:
						days.find((day) => !Number.isFinite(day.price) || day.price <= 0)?.date ?? null,
				}
			}
			continue
		}
		const totalPrice = days.reduce((sum, day) => sum + day.price, 0)
		if (!selected || totalPrice < selected.totalPrice) {
			selected = { ratePlanId, totalPrice, days }
		}
	}

	if (!selected) {
		return {
			holdable: false,
			reason: firstFailure?.reason ?? "UNKNOWN",
			failingDate: firstFailure?.failingDate ?? stayDates[0] ?? null,
			debug: {
				variantId: params.variantId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				occupancyKey,
			},
		}
	}

	return {
		holdable: true,
		ratePlanId: selected.ratePlanId,
		totalPrice: selected.totalPrice,
		nights: stayDates.length,
		days: selected.days,
	}
}

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown
		if (contentType.includes("application/json")) {
			const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
			payload = {
				variantId: String(raw.variantId ?? "").trim(),
				dateRange: {
					from: String((raw as any)?.dateRange?.from ?? raw.checkIn ?? raw.from ?? "").trim(),
					to: String((raw as any)?.dateRange?.to ?? raw.checkOut ?? raw.to ?? "").trim(),
				},
				occupancy: Number(raw.occupancy ?? raw.quantity ?? 1),
				sessionId: optionalTrimmed(raw.sessionId ?? request.headers.get("x-session-id")),
			}
		} else {
			const form = await request.formData()
			payload = {
				variantId: String(form.get("variantId") ?? "").trim(),
				dateRange: {
					from: String(form.get("checkIn") ?? form.get("from") ?? "").trim(),
					to: String(form.get("checkOut") ?? form.get("to") ?? "").trim(),
				},
				occupancy: Number(form.get("occupancy") ?? form.get("quantity") ?? 1),
				sessionId: optionalTrimmed(form.get("sessionId")),
			}
		}
		const parsed = schema.parse(payload)
		const effectiveSessionId =
			String(parsed.sessionId ?? "").trim() ||
			String(request.headers.get("x-session-id") ?? "").trim() ||
			String((user as any).id ?? "").trim() ||
			String(user.email ?? "").trim()
		if (!effectiveSessionId) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["sessionId"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const result = await applyInventoryMutation({
			mutate: async () => {
				const variant = await variantManagementRepository.getVariantById(parsed.variantId)
				if (!variant?.productId) throw new Error("variant_not_found")

				const holdability = await resolveHoldabilityFromView({
					productId: variant.productId,
					variantId: parsed.variantId,
					checkIn: parsed.dateRange.from,
					checkOut: parsed.dateRange.to,
					occupancy: parsed.occupancy,
					requestedRooms: parsed.occupancy,
				})
				if (!holdability.holdable) {
					const err = new Error("not_holdable")
					;(err as any).details = holdability
					throw err
				}

				return createInventoryHold(
					{
						repo: inventoryHoldRepository,
						resolvePricingSnapshot: async ({ from, to, occupancy }) => {
							if (from !== parsed.dateRange.from || to !== parsed.dateRange.to) return null
							if (occupancy !== parsed.occupancy) return null
							return {
								ratePlanId: holdability.ratePlanId,
								currency: "USD",
								occupancy: parsed.occupancy,
								from,
								to,
								nights: holdability.nights,
								totalPrice: holdability.totalPrice,
								days: holdability.days,
							}
						},
					},
					{
						variantId: parsed.variantId,
						dateRange: parsed.dateRange,
						occupancy: parsed.occupancy,
						sessionId: effectiveSessionId,
					}
				)
			},
			recompute: (holdResult) => ({
				variantId: parsed.variantId,
				from: parsed.dateRange.from,
				to: parsed.dateRange.to,
				reason: "hold_create",
				idempotencyKey: `hold_create:${holdResult.holdId}`,
			}),
			logContext: {
				action: "hold_create",
				variantId: parsed.variantId,
				from: parsed.dateRange.from,
				to: parsed.dateRange.to,
			},
		})

		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (variant) {
			await invalidateVariant(parsed.variantId, variant.productId)
		}

		console.debug("inventory_hold_created", {
			variantId: parsed.variantId,
			holdId: result.holdId,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		return new Response(
			JSON.stringify({ holdId: result.holdId, expiresAt: result.expiresAt.toISOString() }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof Error && e.message === "not_available") {
			return new Response(
				JSON.stringify({
					error: "not_holdable",
					reason: "NO_CAPACITY",
					failingDate: null,
					debug: null,
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		if (e instanceof Error && e.message === "not_holdable") {
			const details = (e as any).details as
				| {
						reason?: string
						failingDate?: string | null
						debug?: Record<string, unknown>
				  }
				| undefined
			return new Response(
				JSON.stringify({
					error: "not_holdable",
					reason: String(details?.reason ?? "UNKNOWN"),
					failingDate: details?.failingDate ?? null,
					debug: details?.debug ?? null,
				}),
				{
					status: 409,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
