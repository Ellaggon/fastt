import { describe, expect, it } from "vitest"
import { resolveBookingWorkspaceContext } from "@/lib/booking/bookingWorkspaceContext"

describe("booking workspace context", () => {
	it("uses declared commercial lines when a provider has no catalog products yet", () => {
		expect(
			resolveBookingWorkspaceContext({ commercialLines: ["tour"], requestedScope: "tour" })
		).toEqual({ valid: true, vertical: "tour", availableVerticals: ["tour"] })
	})

	it("infers a single active business line for an unscoped deep link", () => {
		expect(resolveBookingWorkspaceContext({ productTypes: ["Tour"] })).toEqual({
			valid: true,
			vertical: "tour",
			availableVerticals: ["tour"],
		})
	})

	it("keeps mixed providers consolidated unless the URL explicitly selects a line", () => {
		expect(
			resolveBookingWorkspaceContext({
				productTypes: ["Hotel", "Tour"],
			})
		).toEqual({ valid: true, vertical: null, availableVerticals: ["hotel", "tour"] })
		expect(
			resolveBookingWorkspaceContext({
				productTypes: ["Hotel", "Tour"],
				requestedScope: "tour",
			})
		).toEqual({ valid: true, vertical: "tour", availableVerticals: ["hotel", "tour"] })
	})

	it("uses an ownership-verified product as the strongest context", () => {
		expect(
			resolveBookingWorkspaceContext({
				productTypes: ["Hotel", "Tour"],
				verifiedProductType: "Tour",
			})
		).toEqual({ valid: true, vertical: "tour", availableVerticals: ["hotel", "tour"] })
	})

	it.each([
		[
			"a line that is not offered",
			{ productTypes: ["tour"], requestedScope: "hotel" },
			"scope_unavailable",
		],
		[
			"an unsupported scope",
			{ productTypes: ["tour"], requestedScope: "package" },
			"unsupported_scope",
		],
		[
			"a product and URL that name different lines",
			{ productTypes: ["hotel", "tour"], requestedScope: "hotel", verifiedProductType: "tour" },
			"scope_product_mismatch",
		],
		[
			"a consolidated URL paired with a concrete product",
			{ productTypes: ["hotel", "tour"], requestedScope: "all", verifiedProductType: "tour" },
			"scope_product_mismatch",
		],
	])("rejects %s instead of showing another business", (_label, input, reason) => {
		expect(
			resolveBookingWorkspaceContext(input as Parameters<typeof resolveBookingWorkspaceContext>[0])
		).toMatchObject({
			valid: false,
			reason,
		})
	})
})
