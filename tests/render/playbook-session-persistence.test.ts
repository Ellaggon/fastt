import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: async () => null }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => null,
}))
import PlaybookLayout from "@/layouts/PlaybookLayout.astro"

describe("lightweight guided navigation persistence", () => {
	it.each(["tour", "hotel"])(
		"renders the v2 writer with product and selection for %s lightweight detail",
		async (vertical) => {
			const container = await AstroContainer.create()
			const html = await container.renderToString(PlaybookLayout, {
				request: new Request(
					"https://fastt.test/rates/plans/rate-1?productId=product-1&variantId=option-1&ratePlanId=rate-1&playbook=complete-to-publish&step=bookingPolicies"
				),
				props: {
					active: true,
					playbookId: "complete-to-publish",
					stepId: "bookingPolicies",
					productId: "product-1",
					variantId: "option-1",
					ratePlanId: "rate-1",
					playbookVertical: vertical,
					isHotel: vertical === "hotel",
					lightweight: true,
				},
			})
			expect(html).toMatch(/<p\b[^>]*data-preparation-save-status/)
			expect(html).toContain("writeVersion: 2")
			expect(html).toContain('"productId":"product-1"')
			expect(html).toContain('"variantId":"option-1"')
			expect(html).toContain('"ratePlanId":"rate-1"')
		}
	)
	it("does not create a writer before a product exists", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(PlaybookLayout, {
			request: new Request("https://fastt.test/rates/plans/rate-1"),
			props: { active: true, productId: "", lightweight: true, playbookId: "complete-to-publish" },
		})
		expect(html).not.toMatch(/<p\b[^>]*data-preparation-save-status/)
	})
})
