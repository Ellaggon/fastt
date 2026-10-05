import { describe, expect, it } from "vitest"

import {
	completeToPublishNextHref,
	completeToPublishPreviousHref,
	completeToPublishStepHref,
	getCompleteToPublishPlaybookRepairHref,
	resolveCompleteToPublishPlaybookFromUrl,
} from "@/lib/playbook/complete-to-publish"

describe("tour rate playbook context", () => {
	it("repairs tour content links that only carry offer selection", () => {
		const broken = new URL(
			"http://localhost/product/tour_1/content?variantId=slot_1&ratePlanId=rate_1"
		)
		const repaired = getCompleteToPublishPlaybookRepairHref(broken, {
			isTour: true,
			productId: "tour_1",
		})
		expect(repaired).toContain("playbook=complete-to-publish")
		expect(repaired).toContain("step=content")
		expect(repaired).toContain("flow=complete")
		expect(repaired).toContain("variantId=slot_1")
		expect(repaired).toContain("ratePlanId=rate_1")
	})
	it("recognizes complete-to-publish on the shared rates route", () => {
		const resolved = resolveCompleteToPublishPlaybookFromUrl(
			new URL(
				"http://localhost/rates/plans/manage?productId=tour_1&variantId=slot_1&playbook=complete-to-publish&step=rate&flow=complete"
			)
		)

		expect(resolved).toEqual({
			active: true,
			playbookId: "complete-to-publish",
			stepId: "rate",
			productId: "tour_1",
		})
	})

	it("preserves the selected departure and rate in backward and forward navigation", () => {
		expect(
			completeToPublishPreviousHref("tour_1", "bookingPolicies", "tour", {
				variantId: "slot_1",
				ratePlanId: "rate_1",
			})
		).toContain("variantId=slot_1")
		expect(
			completeToPublishNextHref("tour_1", "bookingPolicies", "tour", {
				variantId: "slot_1",
				ratePlanId: "rate_1",
			})
		).toContain("ratePlanId=rate_1")
	})

	it("keeps the selected departure and rate through the review step", () => {
		const href = completeToPublishStepHref("tour_1", "preview", {
			variantId: "slot_1",
			ratePlanId: "rate_1",
		})
		const url = new URL(href, "http://localhost")

		expect(url.pathname).toBe("/product/tour_1/preview")
		expect(url.searchParams.get("variantId")).toBe("slot_1")
		expect(url.searchParams.get("ratePlanId")).toBe("rate_1")
		expect(url.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(url.searchParams.get("flow")).toBe("complete")
		expect(url.searchParams.get("step")).toBe("preview")
	})

	it("opens the existing departure and rate instead of the create forms", () => {
		const departure = new URL(
			completeToPublishStepHref("tour_1", "departure", {
				variantId: "slot_1",
				ratePlanId: "rate_1",
			}),
			"http://localhost"
		)
		expect(departure.pathname).toBe("/product/tour_1/departures/slot_1")
		expect(departure.searchParams.get("variantId")).toBe("slot_1")
		expect(departure.searchParams.get("ratePlanId")).toBe("rate_1")
		expect(departure.searchParams.get("playbook")).toBe("complete-to-publish")
		const rate = new URL(
			completeToPublishStepHref("tour_1", "rate", { variantId: "slot_1", ratePlanId: "rate_1" }),
			"http://localhost"
		)
		expect(rate.pathname).toContain("/rates/plans/rate_1")
		expect(rate.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(completeToPublishStepHref("tour_1", "departure")).toContain("/departures/new")
	})
})
