import { describe, expect, it } from "vitest"

import {
	buildTourPlaybookHref,
	buildTourProviderPreviewHref,
	getTourRateDetailCanonicalHref,
	getTourSharedRateCanonicalHref,
	getNextTourLaunchStep,
	getPreviousTourLaunchStep,
	inferTourLaunchStepFromPathname,
	LAUNCH_TOUR_PLAYBOOK_ID,
	TOUR_LAUNCH_STEPS,
	getTourLaunchStepById,
	tourPresentationCanonicalHref,
} from "@/lib/playbook/launch-tour"
import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"

describe("playbook/launch-tour", () => {
	it("keeps the price editor distinct from conditions in both preparation modes", () => {
		for (const playbook of ["launch-tour", "complete-to-publish"]) {
			const url = new URL(
				`https://fastt.test/rates/plans/rate?playbook=${playbook}&vista=price&step=conditions`
			)
			const href = getTourRateDetailCanonicalHref(url, {
				isTour: true,
				productId: "tour",
				variantId: "option",
				ratePlanId: "rate",
			})
			expect(new URL(href!, url.origin).searchParams.get("step")).toBe("rate")
		}
	})

	it("canonicalizes legacy and generic create links for a tour rate detail", () => {
		const context = {
			isTour: true,
			productId: "tour_123",
			variantId: "slot_1",
			ratePlanId: "rate_1",
		}
		for (const query of [
			"playbook=launch&flow=create&step=price",
			"playbook=add-room&step=create-rate",
			"flow=create&vista=conditions&productId=wrong&variantId=wrong&ratePlanId=wrong",
		]) {
			const url = new URL(`https://fastt.test/rates/plans/rate_1?${query}`)
			const href = getTourRateDetailCanonicalHref(url, context)
			expect(href).toBeTruthy()
			const redirected = new URL(href!, "https://fastt.test")
			expect(redirected.searchParams.get("playbook")).toBe("complete-to-publish")
			expect(redirected.searchParams.get("step")).toBe("bookingPolicies")
			expect(redirected.searchParams.get("flow")).toBe("complete")
			expect(redirected.searchParams.get("productId")).toBe("tour_123")
			expect(redirected.searchParams.get("variantId")).toBe("slot_1")
			expect(redirected.searchParams.get("ratePlanId")).toBe("rate_1")
		}
		const generic = getTourRateDetailCanonicalHref(
			new URL(
				"https://fastt.test/rates/plans/rate_1?flow=create&vista=conditions&productId=wrong&variantId=wrong&ratePlanId=wrong"
			),
			context
		)
		const canonical = new URL(generic!, "https://fastt.test")
		expect(canonical.searchParams.get("vista")).toBe("conditions")
		expect(
			getTourRateDetailCanonicalHref(
				new URL("https://fastt.test/rates/plans/rate_1?playbook=launch-tour&flow=create"),
				context
			)
		).toContain("productId=tour_123")
	})

	it("preserves explicit tour continuation and never rewrites hotel routes", () => {
		const context = {
			isTour: true,
			productId: "tour_123",
			variantId: "slot_1",
			ratePlanId: "rate_1",
		}
		expect(
			getTourRateDetailCanonicalHref(
				new URL(
					"https://fastt.test/rates/plans/rate_1?playbook=complete-to-publish&step=bookingPolicies&flow=complete"
				),
				context
			)
		).toContain("variantId=slot_1")
		expect(
			getTourRateDetailCanonicalHref(
				new URL(
					"https://fastt.test/rates/plans/rate_1?playbook=complete-to-publish&step=bookingPolicies&flow=complete&productId=tour_123&variantId=slot_1&ratePlanId=rate_1&tourFlowVersion=2"
				),
				context
			)
		).toBeNull()
		expect(
			getTourRateDetailCanonicalHref(new URL("https://fastt.test/rates/plans/rate_1?flow=create"), {
				...context,
				isTour: false,
			})
		).toBeNull()
	})

	it("keeps shared rates pages in the tour flow and preserves selected context", () => {
		const url = new URL(
			"https://fastt.test/rates/calendar?productId=tour_123&variantId=slot_1&flow=create&step=house-rules"
		)
		expect(
			getTourSharedRateCanonicalHref(url, {
				isTour: true,
				step: "calendar",
				productId: "tour_123",
				variantId: "slot_1",
			})
		).toBe(
			"/rates/calendar?productId=tour_123&variantId=slot_1&flow=complete&step=calendar&playbook=complete-to-publish&tourFlowVersion=2"
		)
	})

	it.each([
		["playbook=launch&step=rate", "rate"],
		["playbook=add-room&step=create-rate", "rate"],
		["flow=add-room", "calendar"],
		["flow=create", "calendar"],
	] as const)("normalizes legacy tour entry %s without relying on flow=create", (query, step) => {
		const pathname = step === "rate" ? "/rates/plans/manage" : "/rates/calendar"
		const href = getTourSharedRateCanonicalHref(new URL(`https://fastt.test${pathname}?${query}`), {
			isTour: true,
			step,
			productId: "tour_123",
			variantId: "slot_1",
			ratePlanId: step === "calendar" ? "rate_1" : undefined,
		})
		const canonical = new URL(href!, "https://fastt.test")
		expect(canonical.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(canonical.searchParams.get("flow")).toBe("complete")
		expect(canonical.searchParams.get("step")).toBe(step)
		expect(canonical.searchParams.get("productId")).toBe("tour_123")
		expect(canonical.searchParams.get("variantId")).toBe("slot_1")
		expect(canonical.searchParams.get("ratePlanId")).toBe(step === "calendar" ? "rate_1" : null)
	})

	it("preserves complete-to-publish and leaves ordinary and hotel entries untouched", () => {
		const complete = getTourSharedRateCanonicalHref(
			new URL("https://fastt.test/rates/calendar?playbook=complete-to-publish&step=calendar"),
			{
				isTour: true,
				step: "calendar",
				productId: "tour_123",
				variantId: "slot_1",
				ratePlanId: "rate_1",
			}
		)
		const canonical = new URL(complete!, "https://fastt.test")
		expect(canonical.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(canonical.searchParams.get("flow")).toBe("complete")
		expect(canonical.searchParams.get("step")).toBe("calendar")
		expect(
			getTourSharedRateCanonicalHref(new URL("https://fastt.test/rates/calendar"), {
				isTour: true,
				step: "calendar",
				productId: "tour_123",
			})
		).toBeNull()
		expect(
			getTourSharedRateCanonicalHref(
				new URL("https://fastt.test/rates/calendar?playbook=add-room"),
				{ isTour: false, step: "calendar", productId: "hotel_123" }
			)
		).toBeNull()
	})

	it("defines a reservable tour path from identity to availability", () => {
		expect(TOUR_LAUNCH_STEPS.map((step) => step.id)).toEqual([
			"create",
			"subtype",
			"location",
			"images",
			"tickets",
		])
	})

	it("preserves the selected option and rate in provider review URLs", () => {
		const context = { productId: "tour_123", variantId: "slot_1", ratePlanId: "rate_1" }
		const reviewHref = getTourLaunchStepById("preview")?.buildHref(context)
		const reviewUrl = new URL(reviewHref!, "https://fastt.test")

		expect(reviewUrl.pathname).toBe("/product/tour_123/preview")
		expect(reviewUrl.searchParams.get("variantId")).toBe("slot_1")
		expect(reviewUrl.searchParams.get("ratePlanId")).toBe("rate_1")
		expect(reviewUrl.searchParams.get("playbook")).toBe("complete-to-publish")

		const publicReviewUrl = new URL(
			buildTourProviderPreviewHref("tour_123", {
				variantId: "slot_1",
				ratePlanId: "rate_1",
			}),
			"https://fastt.test"
		)
		expect(publicReviewUrl.pathname).toBe("/tours/tour_123")
		expect(publicReviewUrl.searchParams.get("preview")).toBe("provider")
		expect(publicReviewUrl.searchParams.get("variantId")).toBe("slot_1")
		expect(publicReviewUrl.searchParams.get("ratePlanId")).toBe("rate_1")
	})

	it("keeps the tour playbook identity through shared product routes", () => {
		const href = buildTourPlaybookHref("/product/tour_123/departures/new", "departure")
		expect(href).toBe(
			"/product/tour_123/departures/new?playbook=launch-tour&step=departure&flow=create&tourFlowVersion=2"
		)
		expect(resolvePlaybookFromUrl(new URL(`https://fastt.test${href}`))).toMatchObject({
			active: true,
			playbookId: "complete-to-publish",
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
		expect(getPreviousTourLaunchStep("tickets")?.id).toBe("images")
		expect(getNextTourLaunchStep("tickets")).toBeNull()
		expect(getNextTourLaunchStep("categories")?.id).toBe("subtype")
		expect(getNextTourLaunchStep("rate")).toBeNull()
		expect(getNextTourLaunchStep("conditions")).toBeNull()
		expect(inferTourLaunchStepFromPathname("/rates/plans/rate_123")).toBe("conditions")
		expect(inferTourLaunchStepFromPathname("/rates/calendar")).toBe("calendar")
	})
})

describe("unified tour presentation", () => {
	it.each(["content", "categories"])(
		"redirects legacy %s preserving commercial and return context",
		(step) => {
			const url = new URL(
				`https://fastt.test/product/tour/${step}?playbook=launch-tour&step=${step}&flow=create&variantId=option&ratePlanId=rate&returnTo=%2Fproduct%2Ftour%2Fpreview`
			)
			const target = new URL(tourPresentationCanonicalHref(url, "tour")!, url.origin)
			expect(target.pathname).toBe("/product/tour/presentation")
			expect(target.searchParams.get("step")).toBe("create")
			expect(target.searchParams.get("variantId")).toBe("option")
			expect(target.searchParams.get("ratePlanId")).toBe("rate")
			expect(target.searchParams.get("returnTo")).toContain("/product/tour/preview?")
			expect(getNextTourLaunchStep(step)?.id).toBe("subtype")
		}
	)
	it("returns from stage two to the existing presentation instead of creating another tour", () => {
		const previous = getPreviousTourLaunchStep("subtype")!
		expect(previous.id).toBe("create")
		expect(
			previous.buildHref({ productId: "tour", variantId: "option", ratePlanId: "rate" })
		).toContain("/product/tour/presentation?")
	})
})

it.each(["content", "categories"])(
	"redirects publication %s to the complete presentation and preserves return",
	(step) => {
		const url = new URL(
			`https://fastt.test/product/tour/${step}?playbook=complete-to-publish&flow=complete&tourFlowVersion=2&step=${step}&variantId=option&ratePlanId=rate&returnTo=%2Fproduct%2Ftour%2Fpreview`
		)
		const target = new URL(tourPresentationCanonicalHref(url, "tour")!, url.origin)
		expect(target.pathname).toBe("/product/tour/presentation")
		expect(target.searchParams.get("step")).toBe("content")
		expect(target.searchParams.get("playbook")).toBe("complete-to-publish")
		expect(target.searchParams.get("variantId")).toBe("option")
		expect(target.searchParams.get("ratePlanId")).toBe("rate")
		expect(target.searchParams.get("returnTo")).toContain("/product/tour/preview?")
	}
)
