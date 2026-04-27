import type { APIRoute } from "astro"

import { searchReadModelRepository } from "@/container/search-read-model.container"
import { buildOccupancyKey, SEARCH_VIEW_REASON_CODES } from "@/modules/search/public"
import { buildSearchViewGovernanceHealth } from "@/modules/search/application/services/search-view-health"

function parseDateOnly(value: string): Date {
	const raw = String(value ?? "").trim()
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
	if (!match) throw new Error(`INVALID_DATE_ONLY:${raw}`)
	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const parsed = new Date(Date.UTC(year, month - 1, day))
	if (parsed.toISOString().slice(0, 10) !== raw) {
		throw new Error(`INVALID_DATE_ONLY:${raw}`)
	}
	return parsed
}

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(base: Date, days: number): Date {
	const next = new Date(base)
	next.setUTCDate(next.getUTCDate() + days)
	return next
}

function enumerateDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = parseDateOnly(from)
	const end = parseDateOnly(to)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

function parseOccupancies(raw: string | null): number[] {
	const values = String(raw ?? "1,2")
		.split(",")
		.map((value) => Number(value.trim()))
		.filter((value) => Number.isInteger(value) && value > 0)
	const deduped = [...new Set(values)].sort((a, b) => a - b)
	return deduped.length > 0 ? deduped : [1, 2]
}

function isGapBlocker(value: string | null): boolean {
	return (
		value === SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE ||
		value === SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE
	)
}

function isInputError(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	return (
		error.message.startsWith("INVALID_DATE_ONLY:") ||
		error.message.startsWith("INVALID_RANGE") ||
		error.message.startsWith("INVALID_NOW")
	)
}

export const GET: APIRoute = async ({ url }) => {
	try {
		const rawFrom = url.searchParams.get("from")
		const rawTo = url.searchParams.get("to")
		const today = toISODateOnly(new Date())
		const from = rawFrom ? toISODateOnly(parseDateOnly(rawFrom)) : today
		const to = rawTo
			? toISODateOnly(parseDateOnly(rawTo))
			: toISODateOnly(addDays(parseDateOnly(from), 30))
		const dates = enumerateDates(from, to)
		const occupancies = parseOccupancies(url.searchParams.get("occupancies"))
		const occupancyKeys = occupancies.map((totalGuests) =>
			buildOccupancyKey({
				rooms: 1,
				adults: totalGuests,
				children: 0,
				totalGuests,
			})
		)

		const variantId = url.searchParams.get("variantId") ?? undefined
		const productId = url.searchParams.get("productId") ?? undefined
		const nowParam = url.searchParams.get("now")
		const now = nowParam ? new Date(nowParam) : new Date()
		if (Number.isNaN(now.getTime())) {
			return new Response(JSON.stringify({ ok: false, error: "INVALID_NOW" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (parseDateOnly(from) >= parseDateOnly(to)) {
			return new Response(JSON.stringify({ ok: false, error: "INVALID_RANGE" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const scopeVariants = await searchReadModelRepository.listSearchViewVariantScope({
			variantId,
			productId,
			activeOnly: true,
		})
		const variantIds = scopeVariants.map((row) => row.variantId)
		const rows = await searchReadModelRepository.listSearchViewHealthRows({
			variantIds,
			from,
			to,
			occupancyKeys,
		})

		const seenCombinations = new Set<string>()
		const gapCombinations = new Set<string>()
		let lastMaterializedAt: string | null = null
		const variantTotals = new Map<
			string,
			{
				expectedRows: number
				presentRows: number
				blockerGapRows: number
				lastMaterializedAt: string | null
			}
		>()

		for (const variant of variantIds) {
			variantTotals.set(variant, {
				expectedRows: dates.length * occupancyKeys.length,
				presentRows: 0,
				blockerGapRows: 0,
				lastMaterializedAt: null,
			})
		}

		for (const row of rows) {
			const combo = `${row.variantId}:${row.occupancyKey}:${row.date}`
			if (!seenCombinations.has(combo)) {
				seenCombinations.add(combo)
				const variant = variantTotals.get(row.variantId)
				if (variant) variant.presentRows += 1
			}
			if (isGapBlocker(row.primaryBlocker)) {
				gapCombinations.add(combo)
				const variant = variantTotals.get(row.variantId)
				if (variant) variant.blockerGapRows += 1
			}
			if (lastMaterializedAt == null || row.computedAt > lastMaterializedAt) {
				lastMaterializedAt = row.computedAt
			}
			const variant = variantTotals.get(row.variantId)
			if (
				variant &&
				(variant.lastMaterializedAt == null || row.computedAt > variant.lastMaterializedAt)
			) {
				variant.lastMaterializedAt = row.computedAt
			}
		}

		const totalExpectedRows = variantIds.length * dates.length * occupancyKeys.length
		const presentRows = seenCombinations.size
		const blockerGapRows = gapCombinations.size

		const health = buildSearchViewGovernanceHealth({
			totalExpectedRows,
			presentRows,
			blockerGapRows,
			lastMaterializedAt,
			now,
		})

		const variantHealth = [...variantTotals.entries()]
			.map(([id, totals]) => ({
				variantId: id,
				...buildSearchViewGovernanceHealth({
					totalExpectedRows: totals.expectedRows,
					presentRows: totals.presentRows,
					blockerGapRows: totals.blockerGapRows,
					lastMaterializedAt: totals.lastMaterializedAt,
					now,
				}),
			}))
			.sort((a, b) => b.gapRows - a.gapRows || a.variantId.localeCompare(b.variantId))

		const variantsWithGaps = variantHealth.filter((row) => row.gapsDetected).length

		return new Response(
			JSON.stringify({
				ok: true,
				scope: {
					from,
					to,
					days: dates.length,
					occupancies,
					variantId: variantId ?? null,
					productId: productId ?? null,
					activeVariants: variantIds.length,
				},
				health,
				aggregates: {
					globalCoverageRatio: health.coverageRatio,
					gapsDetected: health.gapsDetected,
					gapRows: health.gapRows,
					missingRows: health.missingRows,
					blockerGapRows: health.blockerGapRows,
					variantsWithGaps,
				},
				topGapVariants: variantHealth.slice(0, 10).map((row) => ({
					variantId: row.variantId,
					coverageRatio: row.coverageRatio,
					gapRows: row.gapRows,
					reasonCodes: row.reasonCodes,
					isFresh: row.isFresh,
					lastMaterializedAt: row.lastMaterializedAt,
				})),
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error) {
		const status = isInputError(error) ? 400 : 500
		return new Response(
			JSON.stringify({
				ok: false,
				error: error instanceof Error ? error.message : "internal_error",
			}),
			{ status, headers: { "Content-Type": "application/json" } }
		)
	}
}
