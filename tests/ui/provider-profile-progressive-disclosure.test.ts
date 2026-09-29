import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider settings profile is a single save", () => {
	it("shows a read-only summary by default and a unified edit form on demand", () => {
		const page = read("src/pages/provider/settings/profile.astro")
		const register = read("src/components/provider/ProviderRegisterForm.astro")
		const operations = read("src/components/provider/ProviderProfileForm.astro")

		expect(page).toContain("data-provider-settings-unified")
		expect(page).toContain('action="/api/providers/profile"')
		expect(page).toContain("Guardar cambios")
		expect(page).toContain("Editar perfil")
		expect(page).toContain("data-profile-summary")
		expect(page).toContain("data-profile-edit-mode")
		expect(page).toContain("showProfileForm")
		expect(page).toContain("embedded={true}")
		expect(page).toContain("data-profile-identity")
		expect(page).toContain("data-profile-ops")
		expect(page).toContain("data-profile-ops-gated")
		expect(page).not.toContain("<details")
		expect(page).toContain("xl:grid-cols-2")
		expect(page).not.toContain("mx-auto max-w-3xl")

		expect(page).toContain("ProviderSettingsIdentityReadonly")
		expect(page).toContain("ProviderSettingsOpsReadonly")
		expect(page).toContain("Queda bloqueado hasta guardar la identidad comercial")

		expect(register).toContain("embedded = false")
		expect(operations).toContain("embedded = false")
		expect(operations).toContain("data-profile-ops-form")

		expect(register).toContain("ProviderSettingsHubCard")
		expect(page).toContain("ProviderSettingsHubCard")
		expect(read("src/components/provider/ProviderSettingsHubCard.astro")).toContain("bg-sky-50/80")
	})
})
