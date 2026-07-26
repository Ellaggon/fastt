import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("document upload auth alignment (hotel admin)", () => {
	it("resolves LOCAL_QA user by email so ProviderUser links match", () => {
		const auth = read("src/lib/auth/getUserFromRequest.ts")
		expect(auth).toContain("export async function resolveLocalQaAuthUser")
		expect(auth).toContain("lower(${User.email})")
		expect(auth).toContain("await resolveLocalQaAuthUser(request)")
	})

	it("LOCAL_QA session ensures owner ProviderUser link before returning surface", () => {
		const session = read("src/lib/auth/providerSessionSurface.ts")
		expect(session).toContain("resolveLocalQaAuthUser")
		expect(session).toContain("ensureProviderUserOwnerLink")
		expect(session).toContain("await localQaSurface(request)")
	})

	it("document assert heals role before permission check", () => {
		const docs = read("src/lib/provider-documents.ts")
		expect(docs).toContain("healProviderUserRoleIfNeeded")
		expect(docs).toContain("assertCanManageDocuments")
	})

	it("documents API gates on session canManageDocuments before submit", () => {
		const api = read("src/pages/api/provider/settings/documents.ts")
		expect(api).toContain("provider.permissions?.canManageDocuments")
		expect(api).toContain('redirectAfterFormError(request, "forbidden"')
	})
})
