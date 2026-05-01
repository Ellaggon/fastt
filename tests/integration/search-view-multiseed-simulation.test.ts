import { describe, expect, it } from "vitest"
import { db, SearchUnitView } from "astro:db"

import { GET as getSearchViewHealth } from "@/pages/api/internal/search/search-view-health"
import {
	buildOccupancyKey,
	SEARCH_VIEW_REASON_CODES,
	SEARCH_VIEW_SLA,
} from "@/modules/search/public"
import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

type ScenarioMode = "full" | "partial" | "missing"

type SeedScenario = {
	seed: number
	mode: ScenarioMode
	variantId: string
	productId: string
	from: string
	to: string
	occupancies: number[]
	expectedRows: number
}

const NOW_ISO = "2026-10-01T12:00:00.000Z"
const FRESH_COMPUTED_AT = "2026-10-01T11:50:00.000Z"
const STALE_COMPUTED_AT = "2026-10-01T09:00:00.000Z"
const SEEDS = [11, 29, 47, 83, 101]

function mulberry32(seed: number): () => number {
	let value = seed >>> 0
	return () => {
		value += 0x6d2b79f5
		let t = value
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function randInt(next: () => number, min: number, max: number): number {
	return Math.floor(next() * (max - min + 1)) + min
}

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(from: string, days: number): string {
	const date = new Date(`${from}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return toISODateOnly(date)
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

function pickUnique(values: number[], count: number, next: () => number): number[] {
	const pool = [...values]
	const selected: number[] = []
	while (pool.length > 0 && selected.length < count) {
		const index = randInt(next, 0, pool.length - 1)
		selected.push(pool[index])
		pool.splice(index, 1)
	}
	return selected.sort((a, b) => a - b)
}

function buildScenario(seed: number): SeedScenario {
	const next = mulberry32(seed)
	const offset = randInt(next, 0, 20)
	const from = addDays("2026-09-01", offset)
	const days = randInt(next, 2, 6)
	const to = addDays(from, days)
	const occupancyCount = randInt(next, 1, 4)
	const occupancies = pickUnique([1, 2, 3, 4, 5], occupancyCount, next)
	const mode: ScenarioMode = seed % 3 === 0 ? "missing" : seed % 3 === 1 ? "full" : "partial"
	const variantId = `variant_svh_${seed}`
	const productId = `product_svh_${seed}`
	return {
		seed,
		mode,
		variantId,
		productId,
		from,
		to,
		occupancies,
		expectedRows: days * occupancies.length,
	}
}

async function seedScenario(scenario: SeedScenario): Promise<void> {
	const destinationId = `dest_svh_${scenario.seed}`
	await upsertDestination({
		id: destinationId,
		name: `Destination SVH ${scenario.seed}`,
		type: "city",
		country: "CL",
		slug: `dest-svh-${scenario.seed}`,
	})
	await upsertProduct({
		id: scenario.productId,
		name: `Product SVH ${scenario.seed}`,
		productType: "hotel",
		destinationId,
	})
	await upsertVariant({
		id: scenario.variantId,
		productId: scenario.productId,
		kind: "hotel_room",
		name: `Variant SVH ${scenario.seed}`,
		baseRateCurrency: "USD",
		baseRatePrice: 120,
		isActive: true,
		minOccupancy: 1,
		maxOccupancy: 5,
	})

	const dates = enumerateDates(scenario.from, scenario.to)
	const rows: Array<{
		id: string
		date: string
		occupancyKey: string
		totalGuests: number
		primaryBlocker: string | null
		computedAt: string
	}> = []

	let index = 0
	for (const date of dates) {
		for (const occupancy of scenario.occupancies) {
			const occupancyKey = buildOccupancyKey({
				adults: occupancy,
				children: 0,
				infants: 0,
			})
			const rowId = `suv_svh_${scenario.seed}_${date}_${occupancy}`

			if (scenario.mode === "missing") {
				// Keep only one stale row to represent severe missing coverage.
				if (index === 0) {
					rows.push({
						id: rowId,
						date,
						occupancyKey,
						totalGuests: occupancy,
						primaryBlocker: SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE,
						computedAt: STALE_COMPUTED_AT,
					})
				}
				index += 1
				continue
			}

			if (scenario.mode === "partial") {
				// Deterministic mixed gaps: missing rows and explicit partial/missing blockers.
				if (index % 7 === 0) {
					index += 1
					continue
				}
				const blocker =
					index % 5 === 0
						? index % 10 === 0
							? SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE
							: SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE
						: null
				rows.push({
					id: rowId,
					date,
					occupancyKey,
					totalGuests: occupancy,
					primaryBlocker: blocker,
					computedAt: FRESH_COMPUTED_AT,
				})
				index += 1
				continue
			}

			rows.push({
				id: rowId,
				date,
				occupancyKey,
				totalGuests: occupancy,
				primaryBlocker: null,
				computedAt: FRESH_COMPUTED_AT,
			})
			index += 1
		}
	}

	for (const row of rows) {
		await db
			.insert(SearchUnitView)
			.values({
				id: row.id,
				variantId: scenario.variantId,
				productId: scenario.productId,
				ratePlanId: `rp_svh_${scenario.seed}`,
				date: row.date,
				occupancyKey: row.occupancyKey,
				totalGuests: row.totalGuests,
				hasAvailability: true,
				hasPrice: true,
				isSellable: row.primaryBlocker == null,
				isAvailable: true,
				availableUnits: row.primaryBlocker == null ? 3 : 0,
				stopSell: false,
				pricePerNight: 120,
				currency: "USD",
				primaryBlocker: row.primaryBlocker,
				minStay: null,
				cta: false,
				ctd: false,
				computedAt: new Date(row.computedAt),
				sourceVersion: `seed_${scenario.seed}`,
			} as any)
			.onConflictDoUpdate({
				target: [
					SearchUnitView.variantId,
					SearchUnitView.ratePlanId,
					SearchUnitView.date,
					SearchUnitView.occupancyKey,
				],
				set: {
					primaryBlocker: row.primaryBlocker,
					computedAt: new Date(row.computedAt),
					sourceVersion: `seed_${scenario.seed}`,
				},
			})
	}
}

async function readHealth(scenario: SeedScenario) {
	const requestUrl = new URL("http://localhost/api/internal/search/search-view-health")
	requestUrl.searchParams.set("variantId", scenario.variantId)
	requestUrl.searchParams.set("from", scenario.from)
	requestUrl.searchParams.set("to", scenario.to)
	requestUrl.searchParams.set("occupancies", scenario.occupancies.join(","))
	requestUrl.searchParams.set("now", NOW_ISO)

	const response = await getSearchViewHealth({ url: requestUrl } as never)
	expect(response.status).toBe(200)
	return response.json()
}

describe("search view governance multi-seed simulation", () => {
	it("validates coverage, gaps and determinism across deterministic seeds", async () => {
		const scenarios = SEEDS.map(buildScenario)
		for (const scenario of scenarios) {
			await seedScenario(scenario)
		}

		const runA: Array<{
			seed: number
			mode: ScenarioMode
			coverageRatio: number
			isFresh: boolean
			reasonCodes: string[]
			gapRows: number
		}> = []

		for (const scenario of scenarios) {
			const payload1 = await readHealth(scenario)
			const payload2 = await readHealth(scenario)

			// Same seed and same data must be strictly deterministic.
			expect(payload2).toEqual(payload1)

			const reasonCodes = payload1.health.reasonCodes as string[]
			const row = {
				seed: scenario.seed,
				mode: scenario.mode,
				coverageRatio: Number(payload1.health.coverageRatio),
				isFresh: Boolean(payload1.health.isFresh),
				reasonCodes,
				gapRows: Number(payload1.health.gapRows),
			}
			runA.push(row)

			if (scenario.mode === "full") {
				expect(row.isFresh).toBe(true)
				expect(row.coverageRatio).toBeGreaterThanOrEqual(SEARCH_VIEW_SLA.minCoverageThreshold)
				expect(reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.FRESH_VIEW)
				expect(row.gapRows).toBe(0)
			}

			if (scenario.mode === "partial") {
				expect(row.isFresh).toBe(true)
				expect(row.coverageRatio).toBeLessThan(SEARCH_VIEW_SLA.minCoverageThreshold)
				expect(reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE)
				expect(row.gapRows).toBeGreaterThan(0)
			}

			if (scenario.mode === "missing") {
				expect(row.isFresh).toBe(false)
				expect(row.coverageRatio).toBeLessThan(SEARCH_VIEW_SLA.minCoverageThreshold)
				expect(reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.STALE_VIEW)
				expect(reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE)
				expect(row.gapRows).toBeGreaterThan(0)
			}
		}

		// Re-read all seeds consecutively: no drift allowed.
		const runB = await Promise.all(
			scenarios.map(async (scenario) => {
				const payload = await readHealth(scenario)
				return {
					seed: scenario.seed,
					mode: scenario.mode,
					coverageRatio: Number(payload.health.coverageRatio),
					isFresh: Boolean(payload.health.isFresh),
					reasonCodes: payload.health.reasonCodes as string[],
					gapRows: Number(payload.health.gapRows),
				}
			})
		)
		expect(runB).toEqual(runA)
	})
})
