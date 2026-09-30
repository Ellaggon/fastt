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
} from "@/lib/playbook/launch-tour"
import { resolvePlaybookFromUrl } from "@/lib/playbook/resolve-playbook"

describe("playbook/launch-tour", () => {
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
			expect(redirected.searchParams.get("playbook")).toBe("launch-tour")
			expect(redirected.searchParams.get("step")).toBe("conditions")
			expect(redirected.searchParams.get("flow")).toBe("create")
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
					"https://fastt.test/rates/plans/rate_1?playbook=launch-tour&step=conditions&flow=create&productId=tour_123&variantId=slot_1&ratePlanId=rate_1"
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
			"/rates/calendar?productId=tour_123&variantId=slot_1&flow=create&step=calendar&playbook=launch-tour"
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
		expect(canonical.searchParams.get("playbook")).toBe("launch-tour")
		expect(canonical.searchParams.get("flow")).toBe("create")
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
			"content",
			"location",
			"images",
			"subtype",
			"tickets",
			"categories",
			"departure",
			"rate",
			"conditions",
			"calendar",
			"preview",
		])
	})

	it("preserves the selected option and rate in provider review URLs", () => {
		const context = { productId: "tour_123", variantId: "slot_1", ratePlanId: "rate_1" }
		const reviewHref = TOUR_LAUNCH_STEPS.find((step) => step.id === "preview")?.buildHref(context)
		const reviewUrl = new URL(reviewHref!, "https://fastt.test")

		expect(reviewUrl.pathname).toBe("/product/tour_123/preview")
		expect(reviewUrl.searchParams.get("variantId")).toBe("slot_1")
		expect(reviewUrl.searchParams.get("ratePlanId")).toBe("rate_1")
		expect(reviewUrl.searchParams.get("playbook")).toBe("launch-tour")

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
		expect(getNextTourLaunchStep("tickets")?.id).toBe("categories")
		expect(getNextTourLaunchStep("categories")?.id).toBe("departure")
		expect(getNextTourLaunchStep("rate")?.id).toBe("conditions")
		expect(getNextTourLaunchStep("conditions")?.id).toBe("calendar")
		expect(inferTourLaunchStepFromPathname("/rates/plans/rate_123")).toBe("conditions")
		expect(inferTourLaunchStepFromPathname("/rates/calendar")).toBe("calendar")
	})
})
