import { describe, it, expect } from "vitest"
import { preparationPathContext } from "@/lib/onboarding/preparationSessionContext"
const productId = "tour-a"
describe("preparation session paths", () => {
	it.each([
		"/product/tour-b/content",
		"/rates/calendar?productId=tour-b",
		"//example.test",
		"/product/tour-a%2fb/content",
		"/product/tour-a/../tour-b/content",
	])("rejects unrelated or unsafe path %s", (lastPath) => {
		expect(() => preparationPathContext({ productId, lastPath })).toThrow()
	})
	it("checks path identifiers as well as body identifiers", () => {
		expect(() =>
			preparationPathContext({
				productId,
				lastPath: "/rates/plans/rate-b?productId=tour-a",
				ratePlanId: "rate-a",
			})
		).toThrow()
		expect(() =>
			preparationPathContext({
				productId,
				lastPath: "/product/tour-a/departures/option-b",
				variantId: "option-a",
			})
		).toThrow()
	})
	it("extracts selection from the path when the body has no identifiers", () => {
		expect(
			preparationPathContext({ productId, lastPath: "/rates/plans/rate-a?variantId=option-a" })
		).toMatchObject({ variantId: "option-a", ratePlanId: "rate-a", explicitSelection: true })
	})
})
