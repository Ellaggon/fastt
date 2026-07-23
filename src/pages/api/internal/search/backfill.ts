import type { APIRoute } from "astro"
import { and, db, eq, Variant } from "@/shared/infrastructure/db/compat"
import { randomUUID } from "node:crypto"
import { z } from "zod"

import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { recordSearchMaterializationLog } from "@/lib/search/searchMaterializationLog"
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
	const startedAtDate = new Date(startedAt)
	const runId = `search_mat_${startedAtDate.toISOString()}_${randomUUID()}`
	try {
		const payload = await request.json().catch(() => ({}))
		const parsed = schema.parse(payload)

		const fromDate = parsed.from ? new Date(`${parsed.from}T00:00:00.000Z`) : new Date()
		const toDate = parsed.to
			? new Date(`${parsed.to}T00:00:00.000Z`)
			: addDays(fromDate, parsed.horizonDays)
		const from = toISODateOnly(fromDate)
		const to = toISODateOnly(toDate)

		await recordSearchMaterializationLog({
			runId,
			trigger: "api_internal_search_backfill",
			status: "running",
			variantId: parsed.variantId ?? null,
			productId: parsed.productId ?? null,
			fromDate: from,
			toDate: to,
			horizonDays: parsed.horizonDays,
			currency: parsed.currency,
			startedAt: startedAtDate,
			metadataJson: {
				purgeStaleBefore: parsed.purgeStaleBefore,
				maxAgeMinutes: parsed.maxAgeMinutes,
			},
		})

		let variantRows: Array<{ id: string }> = []
		if (parsed.variantId) {
			variantRows = [{ id: parsed.variantId }]
		} else if (parsed.productId) {
			variantRows = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(and(eq(Variant.productId, parsed.productId), eq(Variant.isActive, true)))
		} else {
			variantRows = await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(eq(Variant.isActive, true))
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
		await recordSearchMaterializationLog({
			runId,
			trigger: "api_internal_search_backfill",
			status: "completed",
			variantId: parsed.variantId ?? null,
			productId: parsed.productId ?? null,
			fromDate: from,
			toDate: to,
			horizonDays: parsed.horizonDays,
			currency: parsed.currency,
			variantsScanned: variantIds.length,
			rowsMaterialized: rows,
			purgedRows: purged,
			durationMs,
			startedAt: startedAtDate,
			finishedAt: new Date(),
			metadataJson: {
				purgeStaleBefore: parsed.purgeStaleBefore,
				maxAgeMinutes: parsed.maxAgeMinutes,
			},
		})
		incrementCounter("search_view_backfill_total")
		logger.info("search.view.backfill.completed", {
			runId,
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
				runId,
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
		const durationMs = Date.now() - startedAt
		await recordSearchMaterializationLog({
			runId,
			trigger: "api_internal_search_backfill",
			status: "failed",
			durationMs,
			errorMessage: error instanceof Error ? error.message : String(error),
			startedAt: startedAtDate,
			finishedAt: new Date(),
		}).catch(() => {})
		logger.error("search.view.backfill.failed", {
			runId,
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
