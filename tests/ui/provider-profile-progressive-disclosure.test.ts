import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S5-2 profile progressive disclosure", () => {
	it("puts identity first and collapses/gates ops", () => {
		const page = read("src/pages/provider/settings/profile.astro")
		const form = read("src/components/provider/ProviderProfileForm.astro")

		expect(page).toContain("data-profile-identity-first")
		expect(page).toContain("data-profile-identity")
		expect(page).toContain("data-profile-ops")
		expect(page).toContain("data-profile-ops-gated")
		expect(page).toContain("data-profile-identity-gate")
		expect(page).not.toContain("xl:grid-cols-2")

		expect(page).toContain("<details")
		expect(page).toContain("open={opsDefaultOpen}")
		expect(page).toContain('success === "identity_saved"')
		expect(page).toContain('opsParam === "1"')
		expect(page).toContain('id="ops"')

		const identityIdx = page.indexOf("data-profile-identity")
		const opsIdx = page.indexOf("data-profile-ops")
		expect(identityIdx).toBeGreaterThan(-1)
		expect(opsIdx).toBeGreaterThan(identityIdx)

		expect(page).toContain("Empieza por la identidad comercial")
		expect(page).toContain("Queda bloqueado hasta guardar la identidad comercial")

		expect(form).toContain("data-profile-ops-form")
		expect(form).toContain("documentos mínimos de cumplimiento")
	})
})
