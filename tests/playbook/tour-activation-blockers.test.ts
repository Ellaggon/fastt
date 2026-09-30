import { describe, expect, it } from "vitest"
import { tourActivationBlockers } from "@/lib/playbook/tourActivationBlockers"

describe("tour commercial correction links", () => {
	it.each(["launch-tour", "complete-to-publish"] as const)(
		"preserves selection and guide for %s",
		(playbook) => {
			const result = tourActivationBlockers(
				[
					{ id: "price", label: "Precio pendiente" },
					{ id: "conditions", label: "Condiciones pendientes" },
					{ id: "capacity", label: "Cupo pendiente" },
					{ id: "availability", label: "Fechas pendientes" },
					{ id: "missing_tour_slot_profile", label: "Perfil pendiente" },
				],
				{ productId: "tour-1", variantId: "slot-1", ratePlanId: "rate-1", playbook }
			)
			for (const blocker of result) {
				const url = new URL(blocker.href, "https://fastt.test")
				expect(url.origin).toBe("https://fastt.test")
				expect(url.searchParams.get("productId")).toBe("tour-1")
				expect(url.searchParams.get("variantId")).toBe("slot-1")
				expect(url.searchParams.get("ratePlanId")).toBe("rate-1")
				expect(url.searchParams.get("playbook")).toBe(playbook)
			}
			const urls = result.map((blocker) => new URL(blocker.href, "https://fastt.test"))
			expect(urls[0].pathname).toBe("/rates/plans/rate-1")
			expect(urls[0].searchParams.get("vista")).toBe("price")
			expect(urls[1].searchParams.get("vista")).toBe("conditions")
			expect(urls[1].searchParams.get("step")).toBe(
				playbook === "complete-to-publish" ? "bookingPolicies" : "conditions"
			)
			expect(urls[2].pathname).toBe("/product/tour-1/departures/slot-1")
			expect(urls[3].pathname).toBe("/rates/calendar")
			expect(urls[3].searchParams.get("focus")).toBe("availability")
			expect(urls[4].pathname).toBe("/product/tour-1/departures/slot-1")
		}
	)
})
