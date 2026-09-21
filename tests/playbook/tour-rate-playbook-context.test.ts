import { describe, expect, it } from "vitest"

import {
	completeToPublishNextHref,
	completeToPublishPreviousHref,
	resolveCompleteToPublishPlaybookFromUrl,
} from "@/lib/playbook/complete-to-publish"

describe("tour rate playbook context", () => {
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
})
