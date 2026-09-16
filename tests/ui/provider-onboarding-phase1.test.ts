import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../..", import.meta.url)
const source = (path: string) => readFile(new URL(path, root), "utf8")

describe("phase 1 provider onboarding surface", () => {
	it("uses a reduced onboarding shell and asks for the provider intent", async () => {
		const [layout, page] = await Promise.all([
			source("src/layouts/ProviderOnboardingLayout.astro"),
			source("src/pages/provider/onboarding/index.astro"),
		])
		expect(layout).not.toContain("WorkspaceLayout")
		expect(page).toContain("¿Qué quieres ofrecer en Fastt?")
		expect(page).toContain("providerOnboardingBusinessHref")
		expect(page).toContain("PROVIDER_ONBOARDING_SELECTION_COOKIE")
		expect(page).toContain("Continúa preparando tu")
	})

	it("remembers the selected vertical before business creation", async () => {
		const business = await source("src/pages/provider/onboarding/business.astro")
		expect(business).toContain("Astro.cookies.set(PROVIDER_ONBOARDING_SELECTION_COOKIE, vertical")
		expect(business).toContain("maxAge: 60 * 60 * 24 * 30")
	})

	it("continues identity and operational profile to the selected product", async () => {
		const [business, register, profile, providersApi, profileApi] = await Promise.all([
			source("src/pages/provider/onboarding/business.astro"),
			source("src/components/provider/ProviderRegisterForm.astro"),
			source("src/components/provider/ProviderProfileForm.astro"),
			source("src/pages/api/providers/index.ts"),
			source("src/pages/api/providers/profile.ts"),
		])
		expect(business).toContain("providerOnboardingProductCreateHref")
		expect(register).toContain('name="onboardingNext"')
		expect(profile).toContain('name="onboardingNext"')
		expect(profile).toContain("supportEmailRequired = true")
		expect(providersApi).toContain("resolveProviderOnboardingNext")
		expect(profileApi).toContain("resolveProviderOnboardingNext")
	})

	it("keeps product publication actionable when provider governance blocks it", async () => {
		const [preview, schema] = await Promise.all([
			source("src/pages/product/[id]/preview.astro"),
			source("src/schemas/provider/profile.schema.ts"),
		])
		expect(preview).toContain("evaluateProviderGovernance")
		expect(preview).toContain("data-provider-publish-blocked")
		expect(preview).toContain("provider_configuration_blocked")
		expect(schema).toContain("supportEmail: emailSchema")
	})

	it("diagnoses commercial publication eligibility before publish", async () => {
		const preview = await source("src/pages/product/[id]/preview.astro")
		expect(preview).toContain("getProductPublicationEligibility(productId)")
		expect(preview).toContain("provider_not_commercial")
		expect(preview).toContain("publicationEligible")
	})

	it("sends providerless operational deep links into onboarding", async () => {
		const pages = await Promise.all(
			[
				"src/pages/booking/index.astro",
				"src/pages/booking/day-of.astro",
				"src/pages/financial/index.astro",
				"src/pages/rates/calendar.astro",
				"src/pages/rates/multi-calendar.astro",
				"src/pages/rates/plans/manage.astro",
				"src/pages/provider/settings/index.astro",
			].map(source)
		)
		for (const page of pages) expect(page).toContain("routes.providerOnboardingStart()")
	})
})
