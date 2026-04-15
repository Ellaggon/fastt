import type { APIRoute } from "astro"
import {
	and,
	db,
	DailyInventory,
	EffectiveAvailability,
	eq,
	gte,
	InventoryLock,
	lt,
	sql,
} from "astro:db"
import { z, ZodError } from "zod"

import { productRepository, variantManagementRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

const schema = z.object({
	variantId: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
})

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function enumerateDates(from: string, to: string): string[] {
	const start = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	const out: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "inventory-debug"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
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

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const today = new Date()
		const defaultFrom = toISODateOnly(today)
		const endDate = new Date(today)
		endDate.setUTCDate(endDate.getUTCDate() + 30)
		const defaultTo = toISODateOnly(endDate)

		const parsed = schema.parse({
			variantId: String(url.searchParams.get("variantId") ?? "").trim(),
			from: String(url.searchParams.get("from") ?? defaultFrom).trim(),
			to: String(url.searchParams.get("to") ?? defaultTo).trim(),
		})

		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (!variant) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "variant_not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(
			variant.productId,
			providerId
		)
		if (!owned) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const [dailyRows, effectiveRows, lockRows] = await Promise.all([
			db
				.select({
					date: DailyInventory.date,
					totalInventory: DailyInventory.totalInventory,
					stopSell: DailyInventory.stopSell,
				})
				.from(DailyInventory)
				.where(
					and(
						eq(DailyInventory.variantId, parsed.variantId),
						gte(DailyInventory.date, parsed.from),
						lt(DailyInventory.date, parsed.to)
					)
				)
				.all(),
			db
				.select({
					date: EffectiveAvailability.date,
					totalUnits: EffectiveAvailability.totalUnits,
					heldUnits: EffectiveAvailability.heldUnits,
					bookedUnits: EffectiveAvailability.bookedUnits,
					availableUnits: EffectiveAvailability.availableUnits,
					stopSell: EffectiveAvailability.stopSell,
					isSellable: EffectiveAvailability.isSellable,
					computedAt: EffectiveAvailability.computedAt,
				})
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, parsed.variantId),
						gte(EffectiveAvailability.date, parsed.from),
						lt(EffectiveAvailability.date, parsed.to)
					)
				)
				.all(),
			db
				.select({
					date: InventoryLock.date,
					quantity: InventoryLock.quantity,
					expiresAt: InventoryLock.expiresAt,
					bookingId: InventoryLock.bookingId,
				})
				.from(InventoryLock)
				.where(
					and(
						eq(InventoryLock.variantId, parsed.variantId),
						gte(InventoryLock.date, parsed.from),
						lt(InventoryLock.date, parsed.to),
						sql`${InventoryLock.holdId} is not null`
					)
				)
				.all(),
		])

		const now = new Date()
		const dailyByDate = new Map(
			dailyRows.map((row) => [
				String(row.date),
				{ total: Number(row.totalInventory ?? 0), stopSell: Boolean(row.stopSell) },
			])
		)
		const effectiveByDate = new Map(
			effectiveRows.map((row) => [
				String(row.date),
				{
					totalUnits: Number(row.totalUnits ?? 0),
					heldUnits: Number(row.heldUnits ?? 0),
					bookedUnits: Number(row.bookedUnits ?? 0),
					availableUnits: Number(row.availableUnits ?? 0),
					stopSell: Boolean(row.stopSell),
					isSellable: Boolean(row.isSellable),
					computedAt: row.computedAt ? String(row.computedAt) : null,
				},
			])
		)

		const heldByDate = new Map<string, number>()
		const bookedByDate = new Map<string, number>()
		for (const lock of lockRows) {
			const date = String(lock.date)
			const qty = Number(lock.quantity ?? 0)
			if (qty <= 0) continue
			if (lock.bookingId) {
				bookedByDate.set(date, Number(bookedByDate.get(date) ?? 0) + qty)
				continue
			}
			if (new Date(lock.expiresAt).getTime() > now.getTime()) {
				heldByDate.set(date, Number(heldByDate.get(date) ?? 0) + qty)
			}
		}

		const days = enumerateDates(parsed.from, parsed.to).map((date) => {
			const daily = dailyByDate.get(date) ?? { total: 0, stopSell: true }
			const heldUnits = Number(heldByDate.get(date) ?? 0)
			const bookedUnits = Number(bookedByDate.get(date) ?? 0)
			const canonicalAvailable = Math.max(0, daily.total - heldUnits - bookedUnits)
			const canonicalSellable = canonicalAvailable > 0 && !daily.stopSell

			const effective = effectiveByDate.get(date) ?? null
			const mismatch =
				effective == null
					? true
					: effective.totalUnits !== daily.total ||
						effective.heldUnits !== heldUnits ||
						effective.bookedUnits !== bookedUnits ||
						effective.availableUnits !== canonicalAvailable ||
						effective.stopSell !== daily.stopSell ||
						effective.isSellable !== canonicalSellable

			return {
				date,
				dailyInventory: {
					totalUnits: daily.total,
					stopSell: daily.stopSell,
				},
				locks: {
					heldUnits,
					bookedUnits,
				},
				canonicalDerived: {
					availableUnits: canonicalAvailable,
					isSellable: canonicalSellable,
				},
				effectiveAvailability: effective,
				mismatch,
			}
		})

		const mismatches = days.filter((row) => row.mismatch).length

		logEndpoint()
		return new Response(
			JSON.stringify({
				variantId: parsed.variantId,
				from: parsed.from,
				to: parsed.to,
				mismatches,
				days,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error) {
		logEndpoint()
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
