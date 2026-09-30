import { describe, expect, it } from "vitest"

import {
	buildCompleteToPublishResumeHref,
	resolveCompleteToPublishResume,
} from "@/lib/playbook/complete-to-publish"
import type { CompleteToPublishCheck } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"

function check(sectionKey: ProductVerticalSectionKey, complete: boolean): CompleteToPublishCheck {
	return {
		key: sectionKey,
		sectionKey,
		label: sectionKey,
		guestImpact: "",
		complete,
		statusLabel: complete ? "ok" : "pending",
		href: `/product/tour-1/${sectionKey}`,
		cta: "Continuar",
		detail: "",
	}
}

describe("complete-to-publish resume", () => {
	it("returns to the first unresolved requirement even when later steps are done", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("location", true),
			check("subtype", true),
			check("tickets", true),
			check("departure", false),
			check("preview", false),
		]
		expect(buildCompleteToPublishResumeHref("tour-1", checks)).toBe(
			"/product/tour-1/photos?playbook=complete-to-publish&step=photos&flow=complete"
		)
	})

	it("resumes the first incomplete step when nothing later is complete", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("location", false),
			check("preview", false),
		]
		expect(buildCompleteToPublishResumeHref("tour-1", checks)).toBe(
			"/product/tour-1/photos?playbook=complete-to-publish&step=photos&flow=complete"
		)
	})

	it("does not hide itinerary quality gaps after the operator reached tickets", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("location", true),
			check("subtype", true),
			check("itinerary", false),
			check("tickets", true),
			check("departure", false),
			check("preview", false),
		]
		expect(buildCompleteToPublishResumeHref("tour-1", checks)).toBe(
			"/product/tour-1/photos?playbook=complete-to-publish&step=photos&flow=complete"
		)
	})

	it("ignores a saved path that skips an earlier unresolved requirement", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("tickets", false),
			check("preview", false),
		]
		expect(
			resolveCompleteToPublishResume("tour-1", checks, {
				lastPath: "/product/tour-1/tickets?playbook=complete-to-publish&step=tickets&flow=complete",
			}).href
		).toBe("/product/tour-1/photos?playbook=complete-to-publish&step=photos&flow=complete")
	})

	it("preserves the saved path when it is the first unresolved requirement", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("tickets", false),
			check("preview", false),
		]
		const savedPath =
			"/product/tour-1/photos?playbook=complete-to-publish&step=photos&flow=complete&panel=gallery"
		expect(resolveCompleteToPublishResume("tour-1", checks, { lastPath: savedPath }).href).toBe(
			savedPath
		)
	})
})

describe("completed preparation preview selection", () => {
	const diagnosedPreview = {
		...check("preview", true),
		href: "/product/tour-1/preview?variantId=slot-1&ratePlanId=rate-1",
	}
	const checks = [check("content", true), diagnosedPreview]
	it.each([undefined, "", "/product/other/preview?playbook=complete-to-publish"])(
		"uses the diagnosed pair without a usable saved path (%s)",
		(lastPath) => {
			const url = new URL(
				resolveCompleteToPublishResume("tour-1", checks, { lastPath }).href,
				"https://fastt.test"
			)
			expect(url.pathname).toBe("/product/tour-1/preview")
			expect(url.searchParams.get("variantId")).toBe("slot-1")
			expect(url.searchParams.get("ratePlanId")).toBe("rate-1")
			expect(url.searchParams.get("playbook")).toBe("complete-to-publish")
		}
	)
	it("repairs a generic saved preview while retaining its view settings", () => {
		const url = new URL(
			resolveCompleteToPublishResume("tour-1", checks, {
				lastPath: "/product/tour-1/preview?playbook=complete-to-publish&panel=review",
			}).href,
			"https://fastt.test"
		)
		expect(url.searchParams.get("panel")).toBe("review")
		expect(url.searchParams.get("variantId")).toBe("slot-1")
		expect(url.searchParams.get("ratePlanId")).toBe("rate-1")
	})
	it("preserves an explicit saved pair even when the primary offer changes", () => {
		const saved =
			"/product/tour-1/preview?playbook=complete-to-publish&variantId=slot-2&ratePlanId=rate-2"
		expect(resolveCompleteToPublishResume("tour-1", checks, { lastPath: saved }).href).toBe(saved)
	})
	it("does not combine a partial saved selection with another offer", () => {
		const saved = "/product/tour-1/preview?playbook=complete-to-publish&variantId=slot-2"
		expect(resolveCompleteToPublishResume("tour-1", checks, { lastPath: saved }).href).toBe(saved)
	})
	it("keeps hotel previews generic when the diagnostic has no selection", () => {
		const url = new URL(
			resolveCompleteToPublishResume("hotel-1", [
				{ ...check("preview", true), href: "/product/hotel-1/preview" },
			]).href,
			"https://fastt.test"
		)
		expect(url.pathname).toBe("/product/hotel-1/preview")
		expect(url.searchParams.has("variantId")).toBe(false)
		expect(url.searchParams.has("ratePlanId")).toBe(false)
	})
})

it.each([
	"/rates/calendar?productId=tour-1&variantId=slot-2&ratePlanId=rate-2&playbook=complete-to-publish&step=calendar",
	"/rates/plans/rate-2?productId=tour-1&variantId=slot-2&playbook=complete-to-publish&step=rate",
])("carries selection from a completed commercial step into preview (%s)", (lastPath) => {
	const checks = [
		check("calendar", true),
		check("rate", true),
		{
			...check("preview", true),
			href: "/product/tour-1/preview?variantId=slot-1&ratePlanId=rate-1",
		},
	]
	const result = resolveCompleteToPublishResume("tour-1", checks, { lastPath })
	const url = new URL(result.href, "https://fastt.test")
	expect(result.sectionKey).toBe("preview")
	expect(url.pathname).toBe("/product/tour-1/preview")
	expect(url.searchParams.get("variantId")).toBe("slot-2")
	expect(url.searchParams.get("ratePlanId")).toBe("rate-2")
})

it("ignores a saved path whose product path contradicts its query", () => {
	const result = resolveCompleteToPublishResume(
		"tour-1",
		[
			{
				...check("preview", true),
				href: "/product/tour-1/preview?variantId=slot-1&ratePlanId=rate-1",
			},
		],
		{
			lastPath:
				"/product/other/preview?productId=tour-1&variantId=other-slot&ratePlanId=other-rate&playbook=complete-to-publish&step=preview",
		}
	)
	expect(result.href).toContain("/product/tour-1/preview?")
	expect(result.href).toContain("variantId=slot-1")
	expect(result.href).not.toContain("other-slot")
})
