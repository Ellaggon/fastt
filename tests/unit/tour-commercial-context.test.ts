import { describe, expect, it } from "vitest"
import {
	resolveTourCommercialContext,
	tourSelectionReturnTo,
	withTourCommercialContext,
	type TourOfferOption,
} from "@/lib/tours/resolveTourCommercialContext"

function option(id = "option", rates = ["rate"]): TourOfferOption {
	return {
		variantId: id,
		name: id,
		bookingMode: "shared",
		lifecycleState: "draft",
		salesEnabled: false,
		hasProfile: true,
		hasCapacity: true,
		rates: rates.map((id) => ({ ratePlanId: id, name: id, isActive: false, isDefault: false })),
	}
}
const resolve = (options: TourOfferOption[], url = {}, session = {}) =>
	resolveTourCommercialContext({ productId: "tour", options, url, session })

describe("tour context selection", () => {
	it("uses URL before session and preserves an inactive draft rate", () => {
		expect(
			resolve(
				[option("a", ["a-rate"]), option("b", ["b-rate"])],
				{ variantId: "b", ratePlanId: "b-rate" },
				{ variantId: "a", ratePlanId: "a-rate" }
			)
		).toMatchObject({ status: "resolved", source: "url", variantId: "b", ratePlanId: "b-rate" })
	})
	it("derives the option from an explicit rate", () => {
		expect(
			resolve([option("a", ["a-rate"]), option("b", ["b-rate"])], { ratePlanId: "b-rate" })
		).toMatchObject({ status: "resolved", variantId: "b" })
	})
	it("an option-only URL uses its sole rate, never a rate from session", () => {
		expect(
			resolve(
				[option("a", ["a-rate"]), option("b", ["b-rate"])],
				{ variantId: "b" },
				{ ratePlanId: "a-rate" }
			)
		).toMatchObject({ source: "url", variantId: "b", ratePlanId: "b-rate" })
	})
	it.each([
		{ variantId: "foreign" },
		{ ratePlanId: "foreign" },
		{ variantId: "a", ratePlanId: "b-rate" },
	])("rejects invalid explicit intent %j without fallback", (url) => {
		expect(
			resolve([option("a", ["a-rate"]), option("b", ["b-rate"])], url, {
				variantId: "a",
				ratePlanId: "a-rate",
			})
		).toMatchObject({
			status: "unresolved",
			reason: "invalid_selection",
			variantId: null,
			ratePlanId: null,
		})
	})
	it("uses a valid session for this product", () => {
		expect(
			resolve(
				[option("a", ["a-rate"]), option("b", ["b-rate"])],
				{},
				{ variantId: "b", ratePlanId: "b-rate" }
			)
		).toMatchObject({ source: "session", variantId: "b" })
	})
	it("discards a stale session only into an unambiguous selection", () => {
		expect(resolve([option()], {}, { ratePlanId: "deleted" })).toMatchObject({
			status: "resolved",
			source: "sole_option",
		})
		expect(
			resolve([option(), option("b", ["b-rate"])], {}, { ratePlanId: "deleted" })
		).toMatchObject({ reason: "selection_required" })
	})
	it("does not let default or activation choose among rates", () => {
		const candidate = option("a", ["first", "second"])
		candidate.rates[0].isDefault = true
		candidate.rates[0].isActive = true
		expect(resolve([candidate])).toMatchObject({ reason: "selection_required" })
	})
	it("a second unfinished option still requires a choice", () => {
		expect(resolve([option(), option("unfinished", [])])).toMatchObject({
			reason: "selection_required",
		})
	})
	it("distinguishes no option, no rate and ambiguous rates", () => {
		expect(resolve([])).toMatchObject({ reason: "missing_option" })
		expect(resolve([option("a", [])])).toMatchObject({ reason: "missing_rate", variantId: "a" })
		expect(resolve([option("a", ["r1", "r2"])], { variantId: "a" })).toMatchObject({
			reason: "selection_required",
			variantId: "a",
		})
	})
	it("excludes archived options and preserves private mode", () => {
		const archived = { ...option("old", ["old-rate"]), lifecycleState: "archived" }
		const privateOption = { ...option(), bookingMode: "private" as const }
		expect(resolve([archived, privateOption])).toMatchObject({
			status: "resolved",
			option: { bookingMode: "private" },
		})
		expect(resolve([archived, privateOption], { variantId: "old" })).toMatchObject({
			reason: "invalid_selection",
		})
	})
	it("links the exact selection and retains guide context", () => {
		const context = resolve([option()])
		const href = withTourCommercialContext(
			"/rates/calendar?playbook=complete-to-publish&step=calendar&flow=complete&variantId=stale#availability",
			context
		)
		const url = new URL(href, "https://fastt.test")
		expect(Object.fromEntries(url.searchParams)).toEqual({
			playbook: "complete-to-publish",
			step: "calendar",
			flow: "complete",
			variantId: "option",
			ratePlanId: "rate",
		})
		expect(url.hash).toBe("#availability")
	})
	it("return links cannot switch product, escape to external sites or loop", () => {
		for (const href of [
			"https://evil.test",
			"//evil.test",
			"/product/other/preview",
			"/product/tour/select-offer",
			"http://[",
			"/admin/support",
		])
			expect(tourSelectionReturnTo("tour", href)).toBe("/product/tour/preview")
		expect(
			tourSelectionReturnTo("tour", "/rates/calendar?productId=other&playbook=complete-to-publish")
		).toBe("/rates/calendar?productId=tour&playbook=complete-to-publish")
	})
})
