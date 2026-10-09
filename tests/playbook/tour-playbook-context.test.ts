import { describe, expect, it } from "vitest"
import {
	resolveTourPlaybookContext,
	tourPublicationHref,
	tourPublicationCorrectionHref,
	tourPublicationReturn,
} from "@/lib/playbook/tour-playbook-context"
import { tourPreparationNextHref } from "@/lib/playbook/launch-tour"
import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"
const selection = { productId: "tour", variantId: "option", ratePlanId: "rate" }
const url = (path: string) => new URL(path, "http://fastt.local")
describe("two connected tour playbooks", () => {
	it("keeps legacy preparation forms in A and moves review into B", () => {
		expect(
			resolveTourPlaybookContext(
				url("/product/tour/images?playbook=complete-to-publish&step=photos&flow=complete"),
				"tour"
			)?.part
		).toBe("prepare")
		expect(
			resolveTourPlaybookContext(url("/product/tour/preview?playbook=launch-tour"), "tour")?.part
		).toBe("publish")
	})
	it("gives explicit preparation precedence over a stale flow parameter", () => {
		expect(
			resolvePlaybookFromUrl(url("/product/tour/content?playbook=launch-tour&flow=complete"), {
				isHotel: false,
			}).playbookId
		).toBe("launch-tour")
	})
	it("returns a publication correction to B and retains its exact offer", () => {
		const path = tourPublicationCorrectionHref(
			"/product/tour/images?step=photos",
			"tour",
			selection
		)
		expect(resolveTourPlaybookContext(url(path), "tour")?.part).toBe("publish")
		expect(tourPreparationNextHref(url(path).searchParams, selection, "images")).toBe(
			tourPublicationHref("tour", selection)
		)
	})
	it("continues preparation while carrying the explicit review return", () => {
		const params = new URLSearchParams({
			playbook: "launch-tour",
			tourFlowVersion: "2",
			returnTo: tourPublicationHref("tour", selection),
		})
		const next = url(tourPreparationNextHref(params, selection, "tickets"))
		expect(next.pathname).toBe("/product/tour/preview")
		expect(next.searchParams.get("variantId")).toBe("option")
		expect(next.searchParams.get("ratePlanId")).toBe("rate")
	})
	it("rejects external, cross-product, cross-offer and nested returns", () => {
		expect(tourPublicationReturn("https://evil.test/product/tour/preview", "tour")).toBeNull()
		expect(tourPublicationReturn("/product/other/preview", "tour")).toBeNull()
		expect(
			tourPublicationReturn("/product/tour/preview?variantId=other", "tour", selection)
		).toBeNull()
		expect(tourPublicationReturn("/product/tour/preview?returnTo=x", "tour")).toBeNull()
	})
	it("transfers the calendar to B without activation", () => {
		const next = url(
			tourPreparationNextHref(
				new URLSearchParams({ playbook: "launch-tour", tourFlowVersion: "2" }),
				selection,
				"calendar"
			)
		)
		expect(next.pathname).toBe("/product/tour/preview")
		expect(next.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(next.searchParams.get("tourFlowVersion")).toBe("2")
	})
	it("preserves hotel completion", () => {
		expect(
			resolvePlaybookFromUrl(url("/product/hotel/images?playbook=complete-to-publish"), {
				isHotel: true,
			}).playbookId
		).toBe("complete-to-publish")
	})
})
