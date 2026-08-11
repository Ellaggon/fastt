import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (relativePath: string) => readFileSync(new URL(relativePath, root), "utf8")

describe("local QA auth priority", () => {
	it("uses the QA fixture only when an authenticated session is absent", () => {
		const auth = read("src/lib/auth/getUserFromRequest.ts")
		const providerSession = read("src/lib/auth/providerSessionSurface.ts")

		expect(auth).toContain("if (!token) {")
		expect(auth).toContain("LOCAL_QA_AUTH_ENABLED silently impersonates the fixture user")
		expect(providerSession).toContain("if (!getSessionIdFromRequest(request)) {")
		expect(providerSession).toContain("never an override")
	})
})
