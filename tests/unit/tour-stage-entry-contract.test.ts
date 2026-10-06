import { describe, expect, it } from "vitest"
import { projectTourPublishingStages } from "@/lib/playbook/tour-publishing-stages"
import { tourPreparationNextHref } from "@/lib/playbook/launch-tour"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"

describe("stable stage destinations independent of missing requirements", () => {
	it("keeps calendar and offer entries stable even when their pending actions create an option", () => {
		const diagnosis = tourDiagnosticFixture()
		for (const id of ["calendar_configuration", "option_profile", "price"] as const) {
			const requirement = diagnosis.requirements[id]
			if (requirement)
				requirement.result = {
					state: "pending",
					responsible: "provider",
					reason: { code: "missing", message: "Falta una opción" },
					action: { label: "Crear opción", href: "/product/tour/departures/new?step=departure" },
				}
		}
		const stages = projectTourPublishingStages(diagnosis)
		expect(new URL(stages[4].href, "http://fastt.local").pathname).toBe("/rates/calendar")
		expect(new URL(stages[3].href, "http://fastt.local").pathname).toBe("/product/tour/tickets")
		expect(stages).toHaveLength(5)
	})
	it("advances from chosen photos to the next logical form instead of the first missing stage", () => {
		const href = tourPreparationNextHref(
			new URLSearchParams("playbook=launch-tour&flow=create&tourFlowVersion=2"),
			{ productId: "tour", variantId: "option", ratePlanId: "rate" },
			"images"
		)
		expect(new URL(href, "http://fastt.local").pathname).toBe("/product/tour/tickets")
	})
	it("returns a publication correction directly to its review with the same selection", () => {
		const returnTo =
			"/product/tour/preview?variantId=option&ratePlanId=rate&playbook=complete-to-publish&tourFlowVersion=2"
		const href = tourPreparationNextHref(
			new URLSearchParams({
				playbook: "complete-to-publish",
				tourFlowVersion: "2",
				flow: "complete",
				returnTo,
			}),
			{ productId: "tour", variantId: "option", ratePlanId: "rate" },
			"images"
		)
		expect(new URL(href, "http://fastt.local").pathname).toBe("/product/tour/preview")
		expect(new URL(href, "http://fastt.local").searchParams.get("variantId")).toBe("option")
	})
})
