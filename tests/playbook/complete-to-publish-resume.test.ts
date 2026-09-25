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
