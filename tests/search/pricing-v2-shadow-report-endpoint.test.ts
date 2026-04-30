import { beforeEach, describe, expect, it } from "vitest"

import { GET as getV2ShadowReport } from "@/pages/api/internal/pricing/v2-shadow-report"
import { resetMetricsForTests } from "@/lib/observability/metrics"
import { resolveSearchOffers } from "@/modules/search/application/use-cases/resolve-search-offers"
import { recomputeEffectivePricingV2Range } from "@/modules/pricing/application/use-cases/recompute-effective-pricing-v2"
import type { SearchOffersRepositoryPort } from "@/modules/search/application/ports/SearchOffersRepository"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

function dateRange(from: string, nights: number): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	for (let i = 0; i < nights; i += 1) {
		out.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

describe("pricing V2 shadow report endpoint", () => {
	beforeEach(() => {
		resetMetricsForTests()
	})

	it("aggregates mismatch/missing metrics and coverage from search shadow read", async () => {
		const dates = dateRange("2026-09-01", 7)
		const v2Rows = new Map<
			string,
			{
				finalBasePrice: number
				baseComponent: number
				occupancyAdjustment: number
				ruleAdjustment: number
			}
		>()
		await recomputeEffectivePricingV2Range(
			{
				async getActiveOccupancyPolicy() {
					return {
						baseAdults: 2,
						baseChildren: 0,
						extraAdultMode: "fixed",
						extraAdultValue: 20,
						childMode: "fixed",
						childValue: 10,
						currency: "USD",
					}
				},
				async getBaseFromPolicy() {
					return { baseAmount: 100, currency: "USD" }
				},
				async getPreviewRules() {
					return []
				},
				async saveEffectivePricingV2(row) {
					v2Rows.set(`${row.variantId}:${row.ratePlanId}:${row.date}:${row.occupancyKey}`, {
						finalBasePrice: row.finalBasePrice,
						baseComponent: row.baseComponent,
						occupancyAdjustment: row.occupancyAdjustment,
						ruleAdjustment: row.ruleAdjustment,
					})
				},
			},
			{
				variantId: "variant-1",
				ratePlanId: "rp-1",
				dates,
			}
		)

		const canonicalOccupancyKey = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
		// Force one mismatch and one missing for canonical occupancy.
		const mismatchKey = `variant-1:rp-1:2026-09-03:${canonicalOccupancyKey}`
		const missingKey = `variant-1:rp-1:2026-09-05:${canonicalOccupancyKey}`
		const mismatchRow = v2Rows.get(mismatchKey)
		if (mismatchRow) {
			v2Rows.set(mismatchKey, {
				...mismatchRow,
				finalBasePrice: mismatchRow.finalBasePrice + 15,
				ruleAdjustment: 15,
			})
		}
		v2Rows.delete(missingKey)

		const repo: SearchOffersRepositoryPort = {
			async listActiveUnitsByProduct() {
				return [
					{
						id: "variant-1",
						productId: "product-1",
						kind: "hotel_room",
						pricing: { basePrice: 100, currency: "USD" },
						capacity: { minOccupancy: 1, maxOccupancy: 4 },
					},
				]
			},
			async listSearchUnitViewRows() {
				return dates.map((date) => {
					return {
						variantId: "variant-1",
						ratePlanId: "rp-1",
						date,
						isSellable: true,
						isAvailable: true,
						hasAvailability: true,
						hasPrice: true,
						stopSell: false,
						availableUnits: 4,
						pricePerNight: 100,
						minStay: 1,
						cta: false,
						ctd: false,
						primaryBlocker: null,
					}
				})
			},
			async listEffectivePricingV2Rows({ from, to, occupancyKey }) {
				return Array.from(v2Rows.entries())
					.filter(([key]) => key.endsWith(`:${occupancyKey}`))
					.map(([key, value]) => {
						const [variantId, ratePlanId, date] = key.split(":")
						return { variantId, ratePlanId, date, ...value }
					})
					.filter((row) => row.date >= from && row.date < to)
			},
		}

		await resolveSearchOffers(
			{
				productId: "product-1",
				checkIn: new Date("2026-09-01T00:00:00.000Z"),
				checkOut: new Date("2026-09-08T00:00:00.000Z"),
				adults: 2,
				children: 0,
				rooms: 1,
				currency: "USD",
			},
			{ repo }
		)

		const response = await getV2ShadowReport({
			url: new URL("http://localhost/api/internal/pricing/v2-shadow-report"),
		} as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.global.totalEvaluated).toBe(7)
		expect(payload.global.matches).toBe(5)
		expect(payload.global.mismatches).toBe(1)
		expect(payload.global.missing).toBe(1)
		expect(payload.global.mismatchRatio).toBeCloseTo(1 / 7, 6)
		expect(payload.global.missingRatio).toBeCloseTo(1 / 7, 6)
		expect(payload.coverageByOccupancyKey[0].occupancyKey).toBe(canonicalOccupancyKey)
		expect(
			payload.mismatchCauses.some(
				(item: { cause: string }) => item.cause === "rule_adjustment_mismatch"
			)
		).toBe(true)
		expect(
			payload.mismatchCauses.some((item: { cause: string }) => item.cause === "missing_v2_row")
		).toBe(true)
		expect(payload.topMismatches.length).toBeGreaterThanOrEqual(1)
	})

	it("returns GO decision when V2 coverage is complete and mismatches are under threshold", async () => {
		resetMetricsForTests()
		const dates = dateRange("2026-10-01", 10)
		const v2Rows = new Map<
			string,
			{
				finalBasePrice: number
				baseComponent: number
				occupancyAdjustment: number
				ruleAdjustment: number
			}
		>()
		const canonicalOccupancyKey = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
		for (const date of dates) {
			v2Rows.set(`variant-1:rp-1:${date}:${canonicalOccupancyKey}`, {
				finalBasePrice: 100,
				baseComponent: 100,
				occupancyAdjustment: 0,
				ruleAdjustment: 0,
			})
		}
		const repo: SearchOffersRepositoryPort = {
			async listActiveUnitsByProduct() {
				return [
					{
						id: "variant-1",
						productId: "product-1",
						kind: "hotel_room",
						pricing: { basePrice: 100, currency: "USD" },
						capacity: { minOccupancy: 1, maxOccupancy: 4 },
					},
				]
			},
			async listSearchUnitViewRows() {
				return dates.map((date) => ({
					variantId: "variant-1",
					ratePlanId: "rp-1",
					date,
					isSellable: true,
					isAvailable: true,
					hasAvailability: true,
					hasPrice: true,
					stopSell: false,
					availableUnits: 3,
					pricePerNight: 100,
					minStay: 1,
					cta: false,
					ctd: false,
					primaryBlocker: null,
				}))
			},
			async listEffectivePricingV2Rows({ from, to, occupancyKey }) {
				return Array.from(v2Rows.entries())
					.filter(([key]) => key.endsWith(`:${occupancyKey}`))
					.map(([key, value]) => {
						const [variantId, ratePlanId, date] = key.split(":")
						return { variantId, ratePlanId, date, ...value }
					})
					.filter((row) => row.date >= from && row.date < to)
			},
		}

		await resolveSearchOffers(
			{
				productId: "product-1",
				checkIn: new Date("2026-10-01T00:00:00.000Z"),
				checkOut: new Date("2026-10-11T00:00:00.000Z"),
				adults: 2,
				children: 0,
				rooms: 1,
				currency: "USD",
			},
			{ repo }
		)

		const response = await getV2ShadowReport({
			url: new URL("http://localhost/api/internal/pricing/v2-shadow-report"),
		} as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.decision).toBe("GO")
		expect(payload.global.missingRatio).toBe(0)
		expect(payload.global.mismatchRatio).toBe(0)
		expect(payload.global.coverageV2Pct).toBe(1)
	})
})
