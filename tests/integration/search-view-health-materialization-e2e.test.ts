import { describe, expect, it } from "vitest"
import {
	and,
	db,
	eq,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	SearchUnitView,
} from "astro:db"

import { GET as getSearchViewHealth } from "@/pages/api/internal/search/search-view-health"
import { materializeSearchUnitRange, SEARCH_VIEW_REASON_CODES } from "@/modules/search/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
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

async function readHealth(params: {
	variantId: string
	from: string
	to: string
	occupancies: number[]
	now: string
}) {
	const requestUrl = new URL("http://localhost/api/internal/search/search-view-health")
	requestUrl.searchParams.set("variantId", params.variantId)
	requestUrl.searchParams.set("from", params.from)
	requestUrl.searchParams.set("to", params.to)
	requestUrl.searchParams.set("occupancies", params.occupancies.join(","))
	requestUrl.searchParams.set("now", params.now)
	const response = await getSearchViewHealth({ url: requestUrl } as never)
	expect(response.status).toBe(200)
	return response.json()
}

describe("search view health endpoint (e2e via real materialization)", () => {
	it("reflects deterministic health state from effective tables through materialization", async () => {
		const seed = `svh_e2e_${Date.now()}`
		const destinationId = `dest_${seed}`
		const productId = `prod_${seed}`
		const variantId = `var_${seed}`
		const templateId = `rpt_${seed}`
		const ratePlanId = `rp_${seed}`
		const from = "2026-11-10"
		const to = "2026-11-13"
		const dates = enumerateDates(from, to)

		await upsertDestination({
			id: destinationId,
			name: "SVH E2E Destination",
			type: "city",
			country: "CL",
			slug: `svh-e2e-${seed}`,
		})
		await upsertProduct({
			id: productId,
			name: "SVH E2E Product",
			productType: "hotel",
			destinationId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "SVH E2E Room",
			baseRateCurrency: "USD",
			baseRatePrice: 100,
			isActive: true,
			minOccupancy: 1,
			maxOccupancy: 2,
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "SVH E2E Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		for (const date of dates) {
			const occupancyKey = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
			await db
				.insert(EffectivePricingV2)
				.values({
					id: `ep_${seed}_${date}`,
					variantId,
					ratePlanId,
					date,
					occupancyKey,
					baseComponent: 100,
					finalBasePrice: 100,

					computedAt: new Date("2026-11-09T12:00:00.000Z"),
				} as any)
				.onConflictDoUpdate({
					target: [
						EffectivePricingV2.variantId,
						EffectivePricingV2.ratePlanId,
						EffectivePricingV2.date,
						EffectivePricingV2.occupancyKey,
					],
					set: {
						baseComponent: 100,
						finalBasePrice: 100,

						computedAt: new Date("2026-11-09T12:00:00.000Z"),
					},
				})

			await db
				.insert(EffectiveRestriction)
				.values({
					id: `er_${seed}_${date}`,
					variantId,
					date,
					stopSell: false,
					minStay: null,
					maxStay: null,
					cta: false,
					ctd: false,
					priority: 0,
					computedAt: new Date("2026-11-09T12:00:00.000Z"),
				} as any)
				.onConflictDoUpdate({
					target: [EffectiveRestriction.variantId, EffectiveRestriction.date],
					set: {
						stopSell: false,
						minStay: null,
						maxStay: null,
						cta: false,
						ctd: false,
						priority: 0,
						computedAt: new Date("2026-11-09T12:00:00.000Z"),
					},
				})
		}

		// Full coverage baseline
		for (const date of dates) {
			await db
				.insert(EffectiveAvailability)
				.values({
					id: `ea_${seed}_${date}`,
					variantId,
					date,
					totalUnits: 4,
					heldUnits: 0,
					bookedUnits: 0,
					availableUnits: 4,
					stopSell: false,
					isSellable: true,
					computedAt: new Date("2026-11-09T12:00:00.000Z"),
				} as any)
				.onConflictDoUpdate({
					target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
					set: {
						totalUnits: 4,
						heldUnits: 0,
						bookedUnits: 0,
						availableUnits: 4,
						stopSell: false,
						isSellable: true,
						computedAt: new Date("2026-11-09T12:00:00.000Z"),
					},
				})
		}

		await materializeSearchUnitRange({
			variantId,
			ratePlanId,
			from,
			to,
			currency: "USD",
		})
		const nowIso = new Date().toISOString()

		const fullA = await readHealth({
			variantId,
			from,
			to,
			occupancies: [1, 2],
			now: nowIso,
		})
		const fullB = await readHealth({
			variantId,
			from,
			to,
			occupancies: [1, 2],
			now: nowIso,
		})
		expect(fullB).toEqual(fullA)
		expect(fullA.health.reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.FRESH_VIEW)
		expect(Number(fullA.health.coverageRatio)).toBe(1)

		// Create a real partial gap by removing one effective availability day and rematerializing.
		await db
			.delete(EffectiveAvailability)
			.where(
				and(
					eq(EffectiveAvailability.variantId, variantId),
					eq(EffectiveAvailability.date, dates[0])
				)
			)
			.run()

		await materializeSearchUnitRange({
			variantId,
			ratePlanId,
			from,
			to,
			currency: "USD",
		})

		const partial = await readHealth({
			variantId,
			from,
			to,
			occupancies: [1, 2],
			now: nowIso,
		})
		expect(partial.health.reasonCodes).toContain(SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE)
		expect(Number(partial.health.coverageRatio)).toBeLessThan(1)
		expect(Number(partial.health.gapRows)).toBeGreaterThan(0)

		// Ensure rows were produced by materializer (not manual SearchUnitView writes).
		const suvRows = await db
			.select({
				variantId: SearchUnitView.variantId,
			})
			.from(SearchUnitView)
			.where(
				and(eq(SearchUnitView.variantId, variantId), eq(SearchUnitView.ratePlanId, ratePlanId))
			)
			.all()
		expect(suvRows.length).toBeGreaterThan(0)
	})

	it("returns 400 for invalid input instead of 500", async () => {
		const requestUrl = new URL("http://localhost/api/internal/search/search-view-health")
		requestUrl.searchParams.set("from", "2026-99-99")
		requestUrl.searchParams.set("to", "2026-11-12")
		const response = await getSearchViewHealth({ url: requestUrl } as never)
		expect(response.status).toBe(400)
		const payload = await response.json()
		expect(payload.ok).toBe(false)
		expect(String(payload.error)).toMatch(/INVALID_DATE_ONLY/)
	})
})
