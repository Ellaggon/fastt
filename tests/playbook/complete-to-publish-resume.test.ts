import { describe, expect, it } from "vitest"

import {
	buildCompleteToPublishResumeHref,
	resolveCompleteToPublishResume,
} from "@/lib/playbook/complete-to-publish"
import type { CompleteToPublishCheck } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"

function check(
	sectionKey: ProductVerticalSectionKey,
	complete: boolean
): CompleteToPublishCheck {
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
	it("does not send the operator back to an earlier quality gap after later steps are done", () => {
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
			"/product/tour-1/departure?playbook=complete-to-publish&step=departure&flow=complete"
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

	it("skips itinerary quality gaps when the operator already reached tickets", () => {
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
			"/product/tour-1/departure?playbook=complete-to-publish&step=departure&flow=complete"
		)
	})

	it("prefers the saved complete-to-publish path for the same product", () => {
		const checks = [
			check("content", true),
			check("photos", false),
			check("tickets", false),
			check("preview", false),
		]
		expect(
			resolveCompleteToPublishResume("tour-1", checks, {
				lastPath:
					"/product/tour-1/tickets?playbook=complete-to-publish&step=tickets&flow=complete",
			}).href
		).toBe("/product/tour-1/tickets?playbook=complete-to-publish&step=tickets&flow=complete")
	})
})
