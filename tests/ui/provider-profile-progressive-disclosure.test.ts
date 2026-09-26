import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider settings profile is a single save", () => {
	it("keeps identity and operations in one form with one submit for an existing provider", () => {
		const page = read("src/pages/provider/settings/profile.astro")
		const register = read("src/components/provider/ProviderRegisterForm.astro")
		const operations = read("src/components/provider/ProviderProfileForm.astro")

		expect(page).toContain("data-provider-settings-unified")
		expect(page).toContain('action="/api/providers/profile"')
		expect(page).toContain("Guardar cambios")
		expect(page).toContain("embedded={true}")
		expect(page).toContain("data-profile-identity")
		expect(page).toContain("data-profile-ops")
		expect(page).toContain("data-profile-ops-gated")
		expect(page).not.toContain("<details")
		expect(page).not.toContain("xl:grid-cols-2")

		const identityIdx = page.indexOf("data-profile-identity")
		const opsIdx = page.indexOf("data-profile-ops")
		expect(identityIdx).toBeGreaterThan(-1)
		expect(opsIdx).toBeGreaterThan(identityIdx)

		expect(page).toContain("Un solo guardado actualiza la identidad comercial")
		expect(page).toContain("Queda bloqueado hasta guardar la identidad comercial")

		expect(register).toContain("embedded = false")
		expect(operations).toContain("embedded = false")
		expect(operations).toContain("data-profile-ops-form")
	})
})
