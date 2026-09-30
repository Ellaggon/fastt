import { describe, expect, it } from "vitest"

import {
	distinctRatePlanOffers,
	findReusableRatePlan,
} from "@/lib/rates/distinctRatePlanOffers"

const offer = (
	ratePlanId: string,
	name: string,
	flags: { isDefault?: boolean; isActive?: boolean } = {}
) => ({
	ratePlanId,
	variantId: "departure-1",
	ratePlanName: name,
	...flags,
})

describe("distinct rate plan offers", () => {
	it("keeps one option per departure and visible tariff name", () => {
		const rows = distinctRatePlanOffers([
			offer("a", "Tarifa estándar · BOB"),
			offer("b", "Tarifa estándar · BOB", { isDefault: true, isActive: true }),
			offer("c", "Tarifa estándar · BOB"),
			offer("d", "Tarifa estándar · USD", { isActive: true }),
			offer("e", "Tarifa flexible"),
		])

		expect(rows.map((row) => row.ratePlanId)).toEqual(["b", "e"])
	})

	it("shows only the first currency saved for a tariff", () => {
		const rows = distinctRatePlanOffers(
			[
				{
					...offer("usd", "Tarifa flexible · USD", { isActive: true }),
					createdAt: "2026-09-25T13:38:15.000Z",
				},
				{
					...offer("bob", "Tarifa flexible · BOB", { isDefault: true, isActive: true }),
					createdAt: "2026-09-20T18:02:46.000Z",
				},
			],
			"usd"
		)

		expect(rows.map((row) => row.ratePlanId)).toEqual(["bob"])
	})

	it("collapses departures that share the same visible name and tariff", () => {
		const rows = distinctRatePlanOffers([
			{
				...offer("a", "Tarifa estándar · BOB", { isDefault: true }),
				productId: "tour-1",
				variantName: "Salida mañana 09:00",
			},
			{
				...offer("b", "Tarifa estándar · BOB"),
				variantId: "departure-2",
				productId: "tour-1",
				variantName: "Salida mañana 09:00",
			},
		])

		expect(rows.map((row) => row.ratePlanId)).toEqual(["a"])
	})

	it("keeps an explicitly selected duplicate so the open calendar stays on that tariff", () => {
		const rows = distinctRatePlanOffers(
			[offer("a", "Tarifa estándar · BOB", { isDefault: true }), offer("b", "Tarifa estándar · BOB")],
			"b"
		)

		expect(rows.map((row) => row.ratePlanId)).toEqual(["b"])
	})

	it("reuses the preferred existing offer instead of creating another copy", () => {
		const reusable = findReusableRatePlan(
			[offer("a", "Tarifa estándar · BOB"), offer("b", "Tarifa estándar · BOB", { isDefault: true })],
			"departure-1",
			"Tarifa estándar · BOB"
		)

		expect(reusable?.ratePlanId).toBe("b")
		expect(findReusableRatePlan([offer("a", "Tarifa estándar · USD")], "departure-1", "Tarifa estándar · BOB")).toBeNull()
	})
})