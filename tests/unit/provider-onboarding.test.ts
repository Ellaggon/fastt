import { describe, expect, it } from "vitest"
import {
	PROVIDER_ONBOARDING_SELECTION_COOKIE,
	providerOnboardingBusinessHref,
	providerOnboardingProductCreateHref,
	providerOnboardingStartHref,
	resolveProviderOnboardingErrorReturn,
	resolveProviderOnboardingNext,
	resolveProviderOnboardingVertical,
} from "@/lib/onboarding/providerOnboarding"

describe("provider onboarding destinations", () => {
	it("starts provider activation with an explicit, resumable intent", () => {
		expect(providerOnboardingStartHref()).toBe("/provider/onboarding?intent=provider")
		expect(PROVIDER_ONBOARDING_SELECTION_COOKIE).toBe("fastt_provider_onboarding_vertical")
	})

	it("recognizes only the two supported provider verticals", () => {
		expect(resolveProviderOnboardingVertical("Tour")).toBe("tour")
		expect(resolveProviderOnboardingVertical("hotel")).toBe("hotel")
		expect(resolveProviderOnboardingVertical("rental")).toBeNull()
	})

	it("keeps identity continuation inside the chosen onboarding flow", () => {
		expect(
			resolveProviderOnboardingNext(
				providerOnboardingBusinessHref("tour"),
				"/provider/settings/profile"
			)
		).toBe(providerOnboardingBusinessHref("tour"))
	})

	it("continues from operations to the selected product creation flow", () => {
		expect(
			resolveProviderOnboardingNext(
				providerOnboardingProductCreateHref("tour"),
				"/provider/settings/profile"
			)
		).toBe(providerOnboardingProductCreateHref("tour"))
		expect(
			resolveProviderOnboardingNext(
				providerOnboardingProductCreateHref("hotel"),
				"/provider/settings/profile"
			)
		).toBe(providerOnboardingProductCreateHref("hotel"))
	})

	it("rejects arbitrary or external form destinations", () => {
		expect(resolveProviderOnboardingNext("https://example.test", "/fallback")).toBe("/fallback")
		expect(resolveProviderOnboardingNext("/booking", "/fallback")).toBe("/fallback")
	})

	it("returns failed saves to the same editable step", () => {
		for (const vertical of ["hotel", "tour"] as const) {
			expect(
				resolveProviderOnboardingErrorReturn(
					providerOnboardingProductCreateHref(vertical),
					"/provider/settings/profile"
				)
			).toBe(providerOnboardingBusinessHref(vertical))
		}
		expect(resolveProviderOnboardingErrorReturn("https://example.test", "/fallback")).toBe(
			"/fallback"
		)
	})
})
