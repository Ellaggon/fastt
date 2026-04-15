import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { and, db, EffectiveAvailability, EffectivePricing, eq, gte, lt, RatePlan } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { productRepository, variantManagementRepository } from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	startDate: z.string().min(1),
	endDate: z.string().min(1),
})

function parseISODate(s: string): Date | null {
	const d = new Date(s)
	return Number.isNaN(d.getTime()) ? null : d
}

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function enumerateDates(start: Date, end: Date): string[] {
	const out: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const url = new URL(request.url)
		const parsed = schema.parse({
			variantId: String(url.searchParams.get("variantId") ?? "").trim(),
			startDate: String(url.searchParams.get("startDate") ?? "").trim(),
			endDate: String(url.searchParams.get("endDate") ?? "").trim(),
		})

		const start = parseISODate(parsed.startDate)
		const end = parseISODate(parsed.endDate)
		if (!start || !end || end <= start) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["dates"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const v = await variantManagementRepository.getVariantById(parsed.variantId)
		if (!v) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(v.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const expectedDates = enumerateDates(start, end)
		const defaultRatePlan = await db
			.select({ id: RatePlan.id, createdAt: RatePlan.createdAt })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, parsed.variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.all()
		const sortedDefaultPlan = defaultRatePlan.slice().sort((a, b) => {
			const at = new Date(a.createdAt as unknown as Date).getTime()
			const bt = new Date(b.createdAt as unknown as Date).getTime()
			if (Number.isNaN(at) && Number.isNaN(bt)) return 0
			if (Number.isNaN(at)) return 1
			if (Number.isNaN(bt)) return -1
			return at - bt
		})[0]

		let rows = await db
			.select({
				date: EffectiveAvailability.date,
				totalUnits: EffectiveAvailability.totalUnits,
				heldUnits: EffectiveAvailability.heldUnits,
				bookedUnits: EffectiveAvailability.bookedUnits,
				availableUnits: EffectiveAvailability.availableUnits,
				stopSell: EffectiveAvailability.stopSell,
				isSellable: EffectiveAvailability.isSellable,
			})
			.from(EffectiveAvailability)
			.where(
				and(
					eq(EffectiveAvailability.variantId, parsed.variantId),
					gte(EffectiveAvailability.date, parsed.startDate),
					lt(EffectiveAvailability.date, parsed.endDate)
				)
			)
			.all()

		const pricingRows = sortedDefaultPlan
			? await db
					.select({
						date: EffectivePricing.date,
					})
					.from(EffectivePricing)
					.where(
						and(
							eq(EffectivePricing.variantId, parsed.variantId),
							eq(EffectivePricing.ratePlanId, String(sortedDefaultPlan.id)),
							gte(EffectivePricing.date, parsed.startDate),
							lt(EffectivePricing.date, parsed.endDate)
						)
					)
					.all()
			: []
		const hasPriceByDate = new Set(pricingRows.map((row) => String(row.date)))

		if (rows.length < expectedDates.length) {
			console.warn("inventory_calendar_missing_materialized_coverage", {
				variantId: parsed.variantId,
				from: parsed.startDate,
				to: parsed.endDate,
				expectedDates: expectedDates.length,
				materializedDates: rows.length,
				missingDatesCount: expectedDates.length - rows.length,
			})
		}

		const byDate = new Map(
			rows.map((r: any) => [
				String(r.date),
				{
					totalUnits: Number(r.totalUnits ?? 0),
					heldUnits: Number(r.heldUnits ?? 0),
					bookedUnits: Number(r.bookedUnits ?? 0),
					availableUnits: Number(r.availableUnits ?? 0),
					stopSell: Boolean(r.stopSell ?? true),
					isSellable: Boolean(r.isSellable ?? false),
				},
			])
		)

		const out = expectedDates.map((date) => {
			const row = byDate.get(date) ?? {
				totalUnits: 0,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: 0,
				stopSell: true,
				isSellable: false,
			}
			return {
				date,
				totalInventory: row.totalUnits,
				totalUnits: row.totalUnits,
				heldUnits: row.heldUnits,
				bookedUnits: row.bookedUnits,
				availableUnits: row.availableUnits,
				available: row.stopSell ? 0 : row.availableUnits,
				stopSell: row.stopSell,
				isSellable: row.isSellable,
				hasEffective: byDate.has(date),
				hasPrice: hasPriceByDate.has(date),
				unsellableReason: !byDate.has(date)
					? "MISSING_AVAILABILITY"
					: row.stopSell
						? "CLOSED"
						: row.availableUnits <= 0
							? "NO_CAPACITY"
							: !hasPriceByDate.has(date)
								? "MISSING_PRICE"
								: null,
			}
		})

		return new Response(JSON.stringify(out), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
