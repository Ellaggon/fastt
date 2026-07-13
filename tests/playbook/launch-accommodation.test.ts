import { describe, expect, it } from "vitest"

import {
	getApplicableLaunchSteps,
	getNextLaunchStep,
	type LaunchContext,
} from "@/lib/playbook/launch-accommodation"

describe("playbook/launch-accommodation", () => {
	it("returns the canonical hotel launch flow with stable numbering across creation", () => {
		const ctx: LaunchContext = {
			productId: "prod_123",
			isHotel: true,
			variantId: "var_123",
			ratePlanId: "rp_123",
		}

		const steps = getApplicableLaunchSteps(ctx)

		expect(steps.map((step) => step.id)).toEqual([
			"create",
			"content",
			"location",
			"images",
			"subtype",
			"room-profile",
			"rate",
			"conditions",
			"calendar",
			"house-rules",
			"preview",
		])
		expect(getNextLaunchStep("room-profile", ctx)?.id).toBe("rate")
		expect(getNextLaunchStep("rate", ctx)?.id).toBe("conditions")
		expect(getNextLaunchStep("conditions", ctx)?.id).toBe("calendar")
	})

	it("builds canonical launch URLs for commercial steps", () => {
		const ctx: LaunchContext = {
			productId: "prod_123",
			isHotel: true,
			variantId: "var_123",
			ratePlanId: "rp_123",
		}
		const steps = Object.fromEntries(
			getApplicableLaunchSteps(ctx).map((step) => [step.id, step.buildHref(ctx)])
		)

		expect(steps.rate).toBe(
			"/rates/plans/manage?productId=prod_123&openDialog=1&variantId=var_123&playbook=launch&step=rate&flow=create"
		)
		expect(steps.conditions).toBe(
			"/rates/plans/rp_123?variantId=var_123&playbook=launch&step=conditions&flow=create"
		)
		expect(steps.calendar).toBe(
			"/rates/calendar?focus=availability&variantId=var_123&ratePlanId=rp_123&playbook=launch&step=calendar&flow=create"
		)
	})

	it("omits hotel-only commercial and room steps for non-hotel products", () => {
		const steps = getApplicableLaunchSteps({
			productId: "tour_123",
			isHotel: false,
		})

		expect(steps.map((step) => step.id)).toEqual([
			"create",
			"content",
			"location",
			"images",
			"subtype",
			"preview",
		])
	})
})
