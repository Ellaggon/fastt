import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { db, eq, InventoryLock } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import { invalidateVariant } from "@/lib/cache/invalidation"
import * as persistentCache from "@/lib/cache/persistentCache"
import { applyInventoryMutation, releaseInventoryHold } from "@/modules/inventory/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"

const schema = z.object({ holdId: z.string().uuid() })

function toExclusiveDate(isoDate: string): string {
	const date = new Date(`${isoDate}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + 1)
	return date.toISOString().slice(0, 10)
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = schema.parse({ holdId: String(form.get("holdId") ?? "").trim() })
		const existingLocks = await db
			.select({
				variantId: InventoryLock.variantId,
				date: InventoryLock.date,
			})
			.from(InventoryLock)
			.where(eq(InventoryLock.holdId, parsed.holdId))
			.all()
		const rangesByVariantId = new Map<string, { from: string; lastDate: string }>()
		for (const lock of existingLocks) {
			const variantId = String(lock.variantId ?? "").trim()
			const date = String((lock as any).date ?? "").trim()
			if (!variantId || !date) continue
			const existing = rangesByVariantId.get(variantId)
			if (!existing) {
				rangesByVariantId.set(variantId, { from: date, lastDate: date })
				continue
			}
			if (date < existing.from) existing.from = date
			if (date > existing.lastDate) existing.lastDate = date
		}

		const recomputeInstructions = [...rangesByVariantId.entries()].map(([variantId, range]) => ({
			variantId,
			from: range.from,
			to: toExclusiveDate(range.lastDate),
			reason: "hold_release",
			idempotencyKey: `hold_release:${parsed.holdId}:${variantId}`,
		}))

		const result = await applyInventoryMutation({
			mutate: async () => releaseInventoryHold({ repo: inventoryHoldRepository }, parsed),
			recompute: recomputeInstructions,
			logContext: { action: "hold_release", holdId: parsed.holdId },
		})
		if (result.released) {
			void persistentCache.del(cacheKeys.holdPricingSnapshot(parsed.holdId)).catch(() => {})
		}

		if (result.released && existingLocks.length > 0) {
			const variantIds = [
				...new Set(existingLocks.map((lock) => String(lock.variantId)).filter(Boolean)),
			]
			await Promise.all(
				variantIds.map(async (variantId) => {
					const variant = await variantManagementRepository.getVariantById(variantId)
					if (variant) {
						await invalidateVariant(variantId, variant.productId)
					}
				})
			)
		}

		return new Response(
			JSON.stringify({ ok: true, released: result.released, days: result.days }),
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
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
