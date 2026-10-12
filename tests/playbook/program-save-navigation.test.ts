import { expect, it } from "vitest"
import { resolvePlaybookRedirectAfterSave } from "@/lib/playbook/playbook-nav"
const resolve = (input: Record<string, string | undefined>) => {
	const form = new FormData()
	for (const [key, value] of Object.entries({
		productId: "tour",
		playbookVertical: "tour",
		variantId: "option",
		ratePlanId: "rate",
		...input,
	}))
		if (value !== undefined) form.set(key, value)
	return new URL(
		resolvePlaybookRedirectAfterSave(form, {
			productId: "tour",
			currentStep: "subtype",
			launchPath: "/product/tour/location",
			launchStep: "location",
		}),
		"http://fastt.local"
	)
}
it("preparation advances to location retaining the selected offer", () => {
	const href = resolve({ playbook: "launch-tour", flow: "create", tourFlowVersion: "2" })
	expect(href.pathname).toBe("/product/tour/location")
	expect(href.searchParams.get("variantId")).toBe("option")
	expect(href.searchParams.get("ratePlanId")).toBe("rate")
})
it("publication correction returns to the exact review", () => {
	const href = resolve({
		playbook: "complete-to-publish",
		flow: "complete",
		returnTo:
			"/product/tour/preview?playbook=complete-to-publish&step=preview&flow=complete&variantId=option&ratePlanId=rate",
	})
	expect(href.pathname).toBe("/product/tour/preview")
	expect(href.searchParams.get("variantId")).toBe("option")
	expect(href.searchParams.get("ratePlanId")).toBe("rate")
})
it.each([
	{},
	{ playbook: "launch-tour", playbookNav: "exit" },
	{ returnTo: "https://evil.test/" },
	{ returnTo: "/product/other" },
])("editing and exiting use the same safe management destination: %j", (input) => {
	const href = resolve(input)
	expect(href.pathname).toBe("/product/tour")
	expect(href.searchParams.get("variantId")).toBe("option")
	expect(href.searchParams.get("ratePlanId")).toBe("rate")
})
it("keeps a valid administrative return and its permitted context", () => {
	const href = resolve({ returnTo: "/product/tour?variantId=stale&ratePlanId=old#ficha" })
	expect(href.hash).toBe("#ficha")
	expect(href.searchParams.get("variantId")).toBe("option")
})
