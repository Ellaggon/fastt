import { describe, expect, it } from "vitest"

import {
	buildTourPlaybookHref,
	getNextTourLaunchStep,
	getPreviousTourLaunchStep,
	inferTourLaunchStepFromPathname,
	LAUNCH_TOUR_PLAYBOOK_ID,
	TOUR_LAUNCH_STEPS,
} from "@/lib/playbook/launch-tour"
import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"

describe("playbook/launch-tour", () => {
	it("defines a reservable tour path from identity to availability", () => {
		expect(TOUR_LAUNCH_STEPS.map((step) => step.id)).toEqual([
			"create",
			"content",
			"location",
			"images",
			"subtype",
			"tickets",
			"departure",
			"rate",
			"conditions",
			"calendar",
			"preview",
		])
	})

	it("keeps the tour playbook identity through shared product routes", () => {
		const href = buildTourPlaybookHref("/product/tour_123/departures/new", "departure")
		expect(href).toBe(
			"/product/tour_123/departures/new?playbook=launch-tour&step=departure&flow=create"
		)
		expect(resolvePlaybookFromUrl(new URL(`https://fastt.test${href}`))).toMatchObject({
			active: true,
			playbookId: LAUNCH_TOUR_PLAYBOOK_ID,
			stepId: "departure",
			productId: "tour_123",
			isHotel: false,
		})
	})

	it("does not let the accommodation fallback claim an explicit tour flow", () => {
		const url = new URL(
			"https://fastt.test/product/create?type=Tour&playbook=launch-tour&step=create&flow=create"
		)
		expect(resolvePlaybookFromUrl(url)).toMatchObject({
			active: true,
			playbookId: LAUNCH_TOUR_PLAYBOOK_ID,
			stepId: "create",
			isHotel: false,
		})
	})

	it("provides the same navigation contract as accommodation", () => {
		expect(getPreviousTourLaunchStep("tickets")?.id).toBe("subtype")
		expect(getNextTourLaunchStep("rate")?.id).toBe("conditions")
		expect(getNextTourLaunchStep("conditions")?.id).toBe("calendar")
		expect(inferTourLaunchStepFromPathname("/rates/plans/rate_123")).toBe("conditions")
		expect(inferTourLaunchStepFromPathname("/rates/calendar")).toBe("calendar")
	})
})
