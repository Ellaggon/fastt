import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (relativePath: string) => readFileSync(new URL(relativePath, root), "utf8")

describe("provider invitation auth continuity", () => {
	it("preserves the invitation destination through sign up, confirmation, sign in and acceptance", () => {
		const signInPage = read("src/pages/SignInPage/index.astro")
		const signup = read("src/pages/api/auth/signup.ts")
		const callback = read("src/pages/auth/callback.astro")
		const accept = read("src/pages/provider/invitations/accept.astro")

		expect(signInPage).toContain('name="returnTo" value={returnTo}')
		expect(signInPage).toContain("user && !hasCustomReturn")
		expect(signup).toContain('sanitizeReturnTo(form.get("returnTo"), "/dashboard")')
		expect(signup).toContain('callbackUrl.searchParams.set("returnTo", returnTo)')
		expect(signup).toContain('headers.set("Location", returnTo)')
		expect(callback).toContain("define:vars={{ returnTo }}")
		expect(callback).toContain("window.location.replace(returnTo)")
		expect(accept).toContain("data-astro-reload")
		expect(accept).toContain("Cambiar de cuenta")
	})
})
