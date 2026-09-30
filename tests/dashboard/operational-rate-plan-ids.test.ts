import { describe, expect, it } from "vitest"

import { operationalRatePlanIds } from "@/lib/dashboard/providerSidebarReadiness"

describe("operational rate plan ids", () => {
	it("counts a tariff that exists before the departure is on sale", () => {
		const ids = operationalRatePlanIds([
			{
				ratePlanId: "bob",
				variantId: "departure",
				ratePlanName: "Tarifa flexible · BOB",
				lifecycleState: "draft",
				isActive: true,
				isDefault: true,
				createdAt: "2026-09-20T18:02:46.000Z",
			},
		])

		expect(ids).toEqual(["bob"])
	})

	it("counts one tariff when the same offer was saved in a second currency", () => {
		const ids = operationalRatePlanIds([
			{
				ratePlanId: "usd",
				variantId: "departure",
				ratePlanName: "Tarifa flexible · USD",
				productId: "tour",
				variantName: "Salida mañana 09:00",
				lifecycleState: "draft",
				isActive: true,
				createdAt: "2026-09-25T13:38:15.000Z",
			},
			{
				ratePlanId: "bob",
				variantId: "departure",
				ratePlanName: "Tarifa flexible · BOB",
				productId: "tour",
				variantName: "Salida mañana 09:00",
				lifecycleState: "draft",
				isActive: true,
				isDefault: true,
				createdAt: "2026-09-20T18:02:46.000Z",
			},
		])

		expect(ids).toEqual(["bob"])
	})

	it("leaves out archived departures and inactive tariffs", () => {
		const ids = operationalRatePlanIds([
			{
				ratePlanId: "archived",
				variantId: "old",
				ratePlanName: "Tarifa flexible",
				lifecycleState: "archived",
				isActive: true,
			},
			{
				ratePlanId: "inactive",
				variantId: "departure",
				ratePlanName: "Tarifa flexible",
				lifecycleState: "ready",
				isActive: false,
			},
			{
				ratePlanId: "current",
				variantId: "departure",
				ratePlanName: "Tarifa estándar",
				lifecycleState: "ready",
				isActive: true,
			},
		])

		expect(ids).toEqual(["current"])
	})
})
