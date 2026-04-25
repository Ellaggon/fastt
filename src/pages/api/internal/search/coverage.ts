import type { APIRoute } from "astro"
import { and, db, eq, gte, lt, SearchUnitView, Variant } from "astro:db"

import { buildOccupancyKey } from "@/modules/search/public"

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(base: Date, days: number): Date {
	const next = new Date(base)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

function enumerateDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function parseOccupancies(raw: string | null): number[] {
	const parsed = String(raw ?? "1,2")
		.split(",")
		.map((value) => Number(value.trim()))
		.filter((value) => Number.isInteger(value) && value > 0)
	return parsed.length > 0 ? Array.from(new Set(parsed)).sort((a, b) => a - b) : [1, 2]
}

export const GET: APIRoute = async ({ url }) => {
	const from = String(url.searchParams.get("from") ?? toISODateOnly(new Date()))
	const to = String(
		url.searchParams.get("to") ?? toISODateOnly(addDays(new Date(`${from}T00:00:00.000Z`), 90))
	)
	const occupancies = parseOccupancies(url.searchParams.get("occupancies"))
	const occupancyKeys = occupancies.map((totalGuests) =>
		buildOccupancyKey({
			rooms: 1,
			adults: totalGuests,
			children: 0,
			totalGuests,
		})
	)
	const dates = enumerateDates(from, to)

	const activeVariants = await db
		.select({ id: Variant.id, productId: Variant.productId })
		.from(Variant)
		.where(eq(Variant.isActive, true))
		.all()

	const rows = await db
		.select({
			variantId: SearchUnitView.variantId,
			date: SearchUnitView.date,
			occupancyKey: SearchUnitView.occupancyKey,
		})
		.from(SearchUnitView)
		.where(and(gte(SearchUnitView.date, from), lt(SearchUnitView.date, to)))
		.all()

	const rowSet = new Set(rows.map((row) => `${row.variantId}:${row.occupancyKey}:${row.date}`))
	const expectedPerVariant = dates.length * occupancyKeys.length
	const missingByVariant: Array<{
		variantId: string
		productId: string
		missingRows: number
		coveragePct: number
	}> = []

	for (const variant of activeVariants) {
		let present = 0
		for (const occupancyKey of occupancyKeys) {
			for (const date of dates) {
				if (rowSet.has(`${variant.id}:${occupancyKey}:${date}`)) {
					present += 1
				}
			}
		}
		const missingRows = Math.max(0, expectedPerVariant - present)
		const coveragePct =
			expectedPerVariant > 0 ? Number(((present / expectedPerVariant) * 100).toFixed(4)) : 100
		if (missingRows > 0) {
			missingByVariant.push({
				variantId: String(variant.id),
				productId: String(variant.productId),
				missingRows,
				coveragePct,
			})
		}
	}

	const globalExpected = activeVariants.length * expectedPerVariant
	const globalPresent = Math.max(
		0,
		globalExpected - missingByVariant.reduce((sum, row) => sum + row.missingRows, 0)
	)
	const globalCoveragePct =
		globalExpected > 0 ? Number(((globalPresent / globalExpected) * 100).toFixed(4)) : 100

	return new Response(
		JSON.stringify({
			ok: true,
			range: { from, to, days: dates.length },
			occupancies,
			activeVariants: activeVariants.length,
			globalCoveragePct,
			globalMissingRows: Math.max(0, globalExpected - globalPresent),
			variantsWithGaps: missingByVariant.length,
			missingByVariant,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}
