import type { APIRoute } from "astro"
import { and, db, eq, Variant } from "astro:db"
import { z } from "zod"

import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { materializeSearchUnitRange, purgeStaleSearchUnitRows } from "@/modules/search/public"

const schema = z.object({
	variantId: z.string().min(1).optional(),
	productId: z.string().min(1).optional(),
	from: z.string().min(1).optional(),
	to: z.string().min(1).optional(),
	horizonDays: z.coerce.number().int().min(1).max(365).default(90),
	currency: z.string().min(1).default("USD"),
	purgeStaleBefore: z.coerce.boolean().default(true),
	maxAgeMinutes: z.coerce
		.number()
		.int()
		.min(1)
		.max(24 * 60)
		.default(60),
})

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(from: Date, days: number): Date {
	const next = new Date(from)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

export const POST: APIRoute = async ({ request }) => {
	const startedAt = Date.now()
	try {
		const payload = await request.json().catch(() => ({}))
		const parsed = schema.parse(payload)

		const fromDate = parsed.from ? new Date(`${parsed.from}T00:00:00.000Z`) : new Date()
		const toDate = parsed.to
			? new Date(`${parsed.to}T00:00:00.000Z`)
			: addDays(fromDate, parsed.horizonDays)
		const from = toISODateOnly(fromDate)
		const to = toISODateOnly(toDate)

		let variantRows: Array<{ id: string }> = []
		if (parsed.variantId) {
			variantRows = [{ id: parsed.variantId }]
		} else if (parsed.productId) {
			variantRows = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(and(eq(Variant.productId, parsed.productId), eq(Variant.isActive, true)))
				.all()
		} else {
			variantRows = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(eq(Variant.isActive, true))
				.all()
		}

		const variantIds = variantRows.map((row) => String(row.id)).filter(Boolean)

		let purged = 0
		if (parsed.purgeStaleBefore) {
			const purge = await purgeStaleSearchUnitRows({ maxAgeMinutes: parsed.maxAgeMinutes })
			purged = purge.removed
		}

		let rows = 0
		for (const variantId of variantIds) {
			const result = await materializeSearchUnitRange({
				variantId,
				from,
				to,
				currency: parsed.currency,
			})
			rows += Number(result.rows ?? 0)
		}

		const durationMs = Date.now() - startedAt
		incrementCounter("search_view_backfill_total")
		logger.info("search.view.backfill.completed", {
			variantCount: variantIds.length,
			rows,
			from,
			to,
			durationMs,
			purged,
		})

		return new Response(
			JSON.stringify({
				ok: true,
				variantCount: variantIds.length,
				rows,
				from,
				to,
				durationMs,
				purged,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error) {
		logger.error("search.view.backfill.failed", {
			message: error instanceof Error ? error.message : String(error),
		})
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
