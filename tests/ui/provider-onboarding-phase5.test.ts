import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("provider onboarding phase 5 rollout surfaces", () => {
	it("applies the server rollout gate to every entry and retains a legacy return", () => {
		for (const path of [
			"src/pages/dashboard/index.astro",
			"src/pages/provider/onboarding/index.astro",
			"src/pages/provider/onboarding/business.astro",
			"src/pages/product/create.astro",
		]) {
			const source = read(path)
			expect(source, path).toContain("resolveProviderOnboardingRollout")
			expect(source, path).toContain("providerOnboardingLegacyHref")
		}
	})

	it("keeps the rollout decision free of request-controlled overrides", () => {
		const rollout = read("src/lib/onboarding/providerOnboardingRollout.ts")
		expect(rollout).toContain("Server-side cohort gate")
		expect(rollout).not.toContain("request:")
		expect(rollout).not.toContain("headers:")
		expect(rollout).not.toContain("query:")
		expect(rollout).toContain('String(value ?? "off")')
	})
})
