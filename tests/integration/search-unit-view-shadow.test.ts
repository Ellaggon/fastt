import { describe, expect, it } from "vitest"
import { and, db, eq, EffectiveAvailability, EffectivePricingV2, SearchUnitView } from "astro:db"

import { materializeSearchUnitRange } from "@/modules/search/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import {
	seedTestProductVariant,
	seedTestRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/search-unit-view-shadow", () => {
	it("materializes daily SearchUnitView rows in shadow mode", async () => {
		const productId = `prod_suv_${crypto.randomUUID()}`
		const variantId = `var_suv_${crypto.randomUUID()}`
		const ratePlanId = `rp_suv_${crypto.randomUUID()}`
		const templateId = `rpt_suv_${crypto.randomUUID()}`

		await seedTestProductVariant({
			productId,
			variantId,
			basePrice: 120,
		})
		await seedTestRatePlan({
			variantId,
			templateId,
			ratePlanId,
			priceRuleId: `pr_suv_${crypto.randomUUID()}`,
		})

		const dates = ["2026-06-10", "2026-06-11"]
		for (const date of dates) {
			await db
				.insert(EffectiveAvailability)
				.values({
					id: `ea_suv_${variantId}_${date}`,
					variantId,
					date,
					totalUnits: 5,
					heldUnits: 0,
					bookedUnits: 0,
					availableUnits: 5,
					stopSell: false,
					isSellable: true,
					computedAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
					set: {
						totalUnits: 5,
						heldUnits: 0,
						bookedUnits: 0,
						availableUnits: 5,
						stopSell: false,
						isSellable: true,
						computedAt: new Date(),
					},
				})

			await db
				.insert(EffectivePricingV2)
				.values({
					id: `ep_suv_${variantId}_${ratePlanId}_${date}`,
					variantId,
					ratePlanId,
					date,
					occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
					baseComponent: 120,

					finalBasePrice: 120,
					computedAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [
						EffectivePricingV2.variantId,
						EffectivePricingV2.ratePlanId,
						EffectivePricingV2.date,
						EffectivePricingV2.occupancyKey,
					],
					set: {
						baseComponent: 120,

						finalBasePrice: 120,
						computedAt: new Date(),
					},
				})
		}

		const result = await materializeSearchUnitRange({
			variantId,
			ratePlanId,
			from: "2026-06-10",
			to: "2026-06-12",
			currency: "USD",
		})

		expect(result.rows).toBeGreaterThan(0)

		const rows = await db
			.select()
			.from(SearchUnitView)
			.where(
				and(eq(SearchUnitView.variantId, variantId), eq(SearchUnitView.ratePlanId, ratePlanId))
			)
			.all()

		expect(rows.length).toBeGreaterThan(0)
		expect(rows.some((row: any) => String(row.date) === "2026-06-10")).toBe(true)
		expect(rows.some((row: any) => Number(row.totalGuests) === 1)).toBe(true)
		expect(rows.every((row: any) => typeof row.occupancyKey === "string")).toBe(true)
	})
})
