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
		expect(new URL(stages[8].href, "http://fastt.local").pathname).toBe("/rates/calendar")
		expect(new URL(stages[4].href, "http://fastt.local").pathname).toBe("/product/tour/tickets")
		expect(stages).toHaveLength(9)
	})
	it("separates itinerary readiness from location and continues in that order", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.requirements.location.result = {
			state: "pending",
			responsible: "provider",
			reason: { code: "location_missing", message: "Define el encuentro" },
			action: { label: "Ubicación", href: "/product/tour/location" },
		}
		const stages = projectTourPublishingStages(diagnosis)
		expect(stages[1].state).toBe("ready")
		expect(stages[2].state).toBe("pending")
		const params = new URLSearchParams("playbook=launch-tour&flow=create&tourFlowVersion=2")
		for (const [step, destination] of [
			["create", "subtype"],
			["subtype", "location"],
			["location", "images"],
		] as const) {
			const href = tourPreparationNextHref(
				params,
				{ productId: "tour", variantId: "option", ratePlanId: "rate" },
				step
			)
			const url = new URL(href, "http://fastt.local")
			expect(url.pathname).toBe(`/product/tour/${destination}`)
			expect(url.searchParams.get("variantId")).toBe("option")
		}
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

it("gives each commercial form its own stage and selected object", () => {
	const stages = projectTourPublishingStages(tourDiagnosticFixture())
	for (const [id, path] of [
		["participants", "/product/tour/tickets"],
		["option", "/product/tour/departures/option"],
		["price", "/rates/plans/rate"],
		["conditions", "/product/tour/conditions"],
	]) {
		const stage = stages.find((stage) => stage.id === id)!
		const url = new URL(stage.href, "http://fastt.local")
		expect(url.pathname).toBe(path)
		expect(url.searchParams.get("variantId")).toBe("option")
		expect(url.searchParams.get("ratePlanId")).toBe("rate")
		if (id === "price") expect(url.searchParams.get("vista")).toBe("price")
		if (id === "conditions") expect(url.searchParams.get("step")).toBe("conditions")
	}
})
it("shows an absent option as an actionable dependency rather than a failed evaluation", () => {
	const diagnosis = tourDiagnosticFixture()
	diagnosis.requirements.option_profile.result = {
		state: "not_evaluable",
		responsible: "provider",
		reason: { code: "missing_option", message: "Primero crea una opción" },
		action: { label: "Crear opción", href: "/product/tour/departures/new" },
	}
	const stage = projectTourPublishingStages(diagnosis).find((stage) => stage.id === "option")!
	expect(stage.state).toBe("pending")
	expect(stage.pendingReason).toBe("Primero crea una opción")
})
