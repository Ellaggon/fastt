import { describe, expect, it } from "vitest"

import { buildTourSelectionPath, type TourCheckoutHold } from "@/lib/tours/tourCheckout"
import { readTourBookingQuestionSnapshot } from "@/lib/tours/tourBookingQuestionsSnapshot"
import { buildIdempotencyHoldId } from "@/modules/inventory/application/use-cases/create-inventory-hold"

describe("tour phase 2/3 commercial continuity", () => {
	it("changes hold identity when tariff or party composition changes", () => {
		const base = {
			sessionId: "traveler-session",
			variantId: "departure-10am",
			from: "2026-10-20",
			to: "2026-10-21",
			rooms: 3,
			ratePlanId: "flexible",
			selectionKey: "flexible:2:1:0",
		}
		const same = buildIdempotencyHoldId({ ...base })
		expect(same).toBe(buildIdempotencyHoldId({ ...base }))
		expect(buildIdempotencyHoldId({ ...base, ratePlanId: "strict" })).not.toBe(same)
		expect(buildIdempotencyHoldId({ ...base, selectionKey: "flexible:1:1:1" })).not.toBe(same)
	})

	it("restores the exact tour selection from checkout", () => {
		const path = buildTourSelectionPath({
			productId: "tour/uyuni",
			variantId: "salida-es",
			ratePlanId: "flexible",
			commercial: {
				from: "2026-10-20",
				occupancyDetail: { adults: 2, children: 1, infants: 1 },
			},
		} as TourCheckoutHold)
		const url = new URL(path, "https://fastt.example")
		expect(url.pathname).toBe("/tours/tour%2Fuyuni")
		expect(Object.fromEntries(url.searchParams)).toEqual({
			departure: "2026-10-20",
			adults: "2",
			children: "1",
			infants: "1",
			variantId: "salida-es",
			ratePlanId: "flexible",
		})
	})

	it("reads only a complete immutable question snapshot", () => {
		expect(
			readTourBookingQuestionSnapshot({
				tourBookingQuestions: [
					{ id: "q1", code: "pickup", label: "Punto de recogida", required: true },
				],
			})
		).toEqual([{ id: "q1", code: "pickup", label: "Punto de recogida", required: true }])
		expect(
			readTourBookingQuestionSnapshot({
				tourBookingQuestions: [{ id: "q1", code: "pickup", label: "" }],
			})
		).toBeNull()
	})
})
