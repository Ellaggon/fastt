import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../..", import.meta.url)
const source = (path: string) => readFile(new URL(path, root), "utf8")

describe("provider settings maintenance surface", () => {
	it("keeps profile editing in Settings while offering incomplete providers one resume path", async () => {
		const page = await source("src/pages/provider/settings/profile.astro")

		expect(page).toContain("resolveProviderOnboardingEntryFromStorage")
		expect(page).toContain("data-settings-onboarding-resume")
		expect(page).toContain("Continuar creando tu tour")
		expect(page).toContain("sin crear ni duplicar otra oferta")
		expect(page).not.toContain('slot="actions"')
		expect(page).toContain("showBackAction={false}")
		expect(page).toContain("showRelatedDomains={false}")
	})

	it("keeps contextual back actions available to onboarding but removable in Settings", async () => {
		const [identity, operations] = await Promise.all([
			source("src/components/provider/ProviderRegisterForm.astro"),
			source("src/components/provider/ProviderProfileForm.astro"),
		])

		expect(identity).toContain("showBackAction = true")
		expect(operations).toContain("showBackAction = true")
		expect(identity).toContain("data-astro-reload")
		expect(operations).toContain("data-astro-reload")
	})
})
