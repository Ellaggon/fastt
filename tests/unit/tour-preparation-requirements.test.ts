import { describe, expect, it } from "vitest"
import {
	formatTourPreparationProgressLine,
	requirementStatusLabel,
	TOUR_PREPARATION_REQUIREMENT_ORDER,
} from "@/lib/tours/tourPreparationRequirements"
import {
	TOUR_LAUNCH_STEPS,
	tourPreparationNextHref,
	tourPreparationReturnHref,
} from "@/lib/playbook/launch-tour"
import { completeToPublishNavigationOrder } from "@/lib/playbook/complete-to-publish"
import { getTourPublishingStage } from "@/lib/playbook/tour-publishing-stages"

describe("continuous tour preparation", () => {
	it("keeps a single monotonic preparation journey in both modes", () => {
		const steps = TOUR_LAUNCH_STEPS.filter((step) => !["create", "preview"].includes(step.id))
		const positions = steps.map((step) => getTourPublishingStage(step.id).position)
		expect(positions).toEqual([...positions].sort((a, b) => a - b))
		expect(completeToPublishNavigationOrder("tour")).toEqual([
			"content",
			...steps.map((step) =>
				step.id === "images" ? "photos" : step.id === "conditions" ? "bookingPolicies" : step.id
			),
			"preview",
		])
		expect(getTourPublishingStage("invalid").id).toBe("presentation")
	})
	it("preserves selection on every creation and continuation transition", () => {
		for (const playbook of ["launch-tour", "complete-to-publish"]) {
			for (const step of TOUR_LAUNCH_STEPS.filter((step) => step.id !== "preview")) {
				const href = tourPreparationNextHref(
					new URLSearchParams({ playbook }),
					{ productId: "tour", variantId: "option", ratePlanId: "rate" },
					step.id
				)
				const url = new URL(href, "http://fastt.local")
				expect(url.searchParams.get("variantId")).toBe("option")
				expect(url.searchParams.get("ratePlanId")).toBe("rate")
				expect(url.searchParams.get("playbook")).toBe(step.id === "tickets" ? null : "launch-tour")
			}
		}
	})
	it("returns corrections to the same product review and rejects unsafe detours", () => {
		const returnTo = "/product/tour/preview?variantId=option&ratePlanId=rate"
		expect(
			tourPreparationNextHref(
				new URLSearchParams({ playbook: "complete-to-publish", tourFlowVersion: "2", returnTo }),
				{ productId: "tour" },
				"rate"
			)
		).toContain("/product/tour/preview?")
		for (const href of [
			"https://evil.test",
			"//evil.test",
			"/product/other/preview",
			"/rates/calendar",
			"/\\evil.test/product/tour/preview",
		])
			expect(tourPreparationReturnHref(href, "tour")).toBeNull()
	})
	it("normalizes legacy aliases without jumping to review", () => {
		expect(
			tourPreparationNextHref(
				new URLSearchParams({ playbook: "complete-to-publish" }),
				{ productId: "tour" },
				"photos"
			)
		).toContain("step=tickets")
		expect(
			tourPreparationNextHref(
				new URLSearchParams({ playbook: "complete-to-publish" }),
				{ productId: "tour" },
				"bookingPolicies"
			)
		).toContain("step=preview")
	})
	it("keeps the ten checks secondary and preserves blocked and unknown statuses", () => {
		expect(TOUR_PREPARATION_REQUIREMENT_ORDER).toHaveLength(11)
		expect(
			formatTourPreparationProgressLine({ readyCount: 9, totalCount: 10, readinessPercent: 90 })
		).toBe("9 de 10 comprobaciones cumplidas")
		for (const [state, label] of [
			["blocked", "Requiere revisión"],
			["not_evaluable", "No se pudo comprobar"],
			["ready", "Completo"],
		] as const)
			expect(requirementStatusLabel({ id: "price", label: "Precio", state, href: null })).toBe(
				label
			)
	})
})
