import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getTourPreviewCanonicalHref } from "@/lib/playbook/launch-tour"
import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"
import { resolveLaunchPlaybookDefinition } from "@/lib/playbook/launch-playbook-definition"
const context = { isTour: true, productId: "tour", variantId: "option", ratePlanId: "rate" }
function entry(query: string) {
	return new URL(
		`https://fastt.test/product/tour/preview?variantId=option&ratePlanId=rate&returnTo=%2Fcatalog%2Ftours&${query}#review`
	)
}
describe("tour preview navigation from trusted product context", () => {
	it.each([
		"playbook=launch",
		"playbook=LAUNCH",
		"flow=CREATE",
		"playbook=launch-accommodation",
		"playbook=add-room",
		"flow=create",
		"flow=add-room",
		"playbook=add-room&flow=complete",
		"playbook=launch&step=room-profile",
		"playbook=launch-tour&flow=add-room",
	])("canonicalizes %s without losing offer or return", (query) => {
		const url = entry(query)
		const href = getTourPreviewCanonicalHref(url, context)!
		expect(href).not.toBeNull()
		const canonical = new URL(href, url)
		expect(canonical.searchParams.get("playbook")).toBe("launch-tour")
		expect(canonical.searchParams.get("step")).toBe("preview")
		expect(canonical.searchParams.get("variantId")).toBe("option")
		expect(canonical.searchParams.get("ratePlanId")).toBe("rate")
		expect(canonical.searchParams.get("returnTo")).toBe("/catalog/tours")
		expect(canonical.hash).toBe("#review")
		const resolved = resolvePlaybookFromUrl(canonical, { isHotel: false })
		expect(resolved.playbookId).toBe("launch-tour")
		const definition = resolveLaunchPlaybookDefinition("launch-tour", {
			productId: "tour",
			isHotel: false,
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(definition.steps.some((step) => step.id === "room-profile")).toBe(false)
		expect(getTourPreviewCanonicalHref(canonical, context)).toBeNull()
	})
	it.each([
		"flow=complete",
		"playbook=complete",
		"playbook=complete-to-publish&step=room-profile",
		"playbook=complete-to-publish&flow=create",
	])("preserves completion intent for %s", (query) => {
		const url = entry(query)
		const canonical = new URL(getTourPreviewCanonicalHref(url, context)!, url)
		expect(canonical.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(canonical.searchParams.get("step")).toBe("preview")
		expect(canonical.searchParams.get("flow")).toBe("complete")
		expect(canonical.searchParams.get("variantId")).toBe("option")
		expect(canonical.searchParams.get("ratePlanId")).toBe("rate")
	})
	it("leaves normal reviews and lodging navigation unchanged", () => {
		expect(
			getTourPreviewCanonicalHref(
				new URL("https://fastt.test/product/tour/preview?returnTo=%2Fcatalog%2Ftours"),
				{ isTour: true, productId: "tour" }
			)
		).toBeNull()
		const url = entry("playbook=add-room")
		expect(getTourPreviewCanonicalHref(url, { ...context, isTour: false })).toBeNull()
		expect(resolvePlaybookFromUrl(url, { isHotel: true }).playbookId).toBe("add-room")
	})
	it("restores complete-to-publish when offer selection is present without playbook params", () => {
		const url = entry("")
		const href = getTourPreviewCanonicalHref(url, context)!
		const canonical = new URL(href, url)
		expect(canonical.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(canonical.searchParams.get("step")).toBe("preview")
		expect(canonical.searchParams.get("flow")).toBe("complete")
	})
	it("normalizes a tour without an option and does not invent a selection", () => {
		const url = new URL("https://fastt.test/product/tour/preview?flow=create")
		const canonical = new URL(
			getTourPreviewCanonicalHref(url, { isTour: true, productId: "tour" })!,
			url
		)
		expect(canonical.searchParams.get("playbook")).toBe("launch-tour")
		expect(canonical.searchParams.has("variantId")).toBe(false)
		expect(canonical.searchParams.has("ratePlanId")).toBe(false)
	})
	it("checks commercial selection before normalization and normalizes before rendering the guide", () => {
		const source = readFileSync("src/pages/product/[id]/preview.astro", "utf8")
		expect(source.indexOf("if (entryResponse) return entryResponse")).toBeLessThan(
			source.indexOf("getTourPreviewCanonicalHref(Astro.url")
		)
		expect(source.indexOf("getTourPreviewCanonicalHref(Astro.url")).toBeLessThan(
			source.indexOf("const playbook = resolvePlaybookFromUrl")
		)
	})
})
