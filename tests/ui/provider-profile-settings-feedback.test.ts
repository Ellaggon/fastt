import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S0-1 profile settings feedback contract", () => {
	it("keeps identity and ops HTML redirects on the canonical settings profile route", () => {
		const createApi = read("src/pages/api/providers/index.ts")
		const updateApi = read("src/pages/api/providers/[id].ts")
		const opsApi = read("src/pages/api/providers/profile.ts")
		const profilePage = read("src/pages/provider/settings/profile.astro")

		for (const source of [createApi, updateApi, opsApi]) {
			expect(source).toContain("routes.providerSettingsProfile()")
			expect(source).not.toContain('"/provider?success=saved"')
			expect(source).not.toContain('url.searchParams.set("step", "register")')
		}

		expect(createApi).toContain('success: "identity_saved"')
		expect(updateApi).toContain('success: "identity_saved"')
		expect(opsApi).toContain('success: "ops_saved"')

		expect(profilePage).toContain('success === "identity_saved"')
		expect(profilePage).toContain('success === "ops_saved"')
		expect(profilePage).toContain('error === "validation_error"')
		expect(profilePage).toContain("Identidad comercial guardada")
		expect(profilePage).toContain("Perfil operativo guardado")
	})
})
