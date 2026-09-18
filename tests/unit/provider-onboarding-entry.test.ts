import { describe, expect, it } from "vitest"

import { resolveProviderOnboardingEntry } from "@/lib/onboarding/providerOnboardingEntry"

const base = {
	explicitProviderIntent: true,
	selectedVertical: "tour" as const,
	profile: { timezone: "America/Santiago", defaultCurrency: "CLP", supportEmail: "ops@fastt.test" },
	activeSessions: [],
	firstProduct: null,
}

describe("provider onboarding entry", () => {
	it("keeps a visitor without a business in the selected provider journey", () => {
		expect(resolveProviderOnboardingEntry({ ...base, hasProvider: false })).toMatchObject({
			kind: "redirect",
			href: "/provider/onboarding/business?vertical=tour",
		})
	})

	it("resumes an active preparation session before using any other state", () => {
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: true,
				activeSessions: [
					{
						productId: "tour-1",
						vertical: "tour",
						productName: "Tour",
						stepId: "rate",
						href: "/rates/plans/manage?productId=tour-1",
					},
				],
			})
		).toMatchObject({ kind: "redirect", href: "/rates/plans/manage?productId=tour-1" })
	})

	it("returns an existing first draft to its guided preparation instead of the dashboard", () => {
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: true,
				firstProduct: { id: "tour-1", productType: "Tour", publicationState: "draft" },
			})
		).toMatchObject({
			kind: "redirect",
			href: "/product/tour-1/content?playbook=launch-tour&step=content&flow=create",
		})
	})

	it("sends a ready first offer to preview and an already published offer to operations", () => {
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: true,
				firstProduct: { id: "hotel-1", productType: "Hotel", publicationState: "ready" },
			})
		).toMatchObject({
			kind: "redirect",
			href: "/product/hotel-1/preview?playbook=launch&step=preview&flow=create",
		})
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: true,
				firstProduct: { id: "hotel-1", productType: "Hotel", publicationState: "published" },
			})
		).toMatchObject({ kind: "redirect", href: "/dashboard" })
	})

	it("recovers a provider without an offer through contact or the selected product", () => {
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: true,
				profile: { timezone: "America/Santiago", defaultCurrency: "CLP", supportEmail: "" },
			})
		).toMatchObject({ kind: "redirect", href: "/provider/onboarding/business?vertical=tour" })
		expect(resolveProviderOnboardingEntry({ ...base, hasProvider: true })).toMatchObject({
			kind: "redirect",
			href: "/product/create?type=Tour&playbook=launch-tour&step=create&flow=create",
		})
	})

	it("does not assume provider intent for a traveler without a business", () => {
		expect(
			resolveProviderOnboardingEntry({
				...base,
				hasProvider: false,
				explicitProviderIntent: false,
				selectedVertical: null,
			})
		).toEqual({ kind: "render-welcome" })
	})
})
